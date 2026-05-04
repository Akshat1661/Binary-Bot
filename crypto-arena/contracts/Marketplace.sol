// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "./CreatureNFT.sol";
import "./ReputationSystem.sol";

/**
 * @title Marketplace
 * @notice Decentralised marketplace for CryptoArena creatures.
 *
 * Features:
 *   - Fixed-price listings  (Feature 5)
 *   - English auctions with optional reserve price  (Feature 3)
 *   - Batch list + batch buy  (Feature 15)
 *   - ERC-2981 royalties on every sale
 *   - Configurable platform fee → flows to Treasury  (Feature 11)
 *   - On-chain reputation awards on completed trades  (Feature 8)
 */
contract Marketplace is ReentrancyGuard, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    CreatureNFT      public creatureNFT;
    ReputationSystem public reputation; // may be address(0) if not wired

    uint256 public platformFeeBps = 250; // 2.5 %
    address public feeRecipient;          // set to Treasury after deploy

    enum ListingType   { FixedPrice, Auction }
    enum ListingStatus { Active, Sold, Cancelled, Ended }

    struct Listing {
        uint256       tokenId;
        address       seller;
        uint256       price;          // fixed price OR auction start price
        uint256       reservePrice;   // auction only (0 = no reserve)
        uint256       auctionEnd;     // 0 for fixed price
        address       highestBidder;
        uint256       highestBid;
        ListingType   listingType;
        ListingStatus status;
    }

    uint256 private _nextListingId = 1;
    mapping(uint256 => Listing)  public listings;
    mapping(uint256 => uint256)  public activeListingOf; // tokenId → listingId

    uint256 public constant MIN_AUCTION_DURATION  = 1 minutes;
    uint256 public constant MAX_AUCTION_DURATION  = 7 days;
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5 %

    event Listed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address seller,
        uint256 price,
        uint256 reservePrice,
        ListingType listingType,
        uint256 auctionEnd
    );
    event Sold(uint256 indexed listingId, uint256 indexed tokenId, address buyer, uint256 price);
    event Bid(uint256 indexed listingId, address bidder, uint256 amount);
    event Cancelled(uint256 indexed listingId, uint256 indexed tokenId);
    event AuctionFinalized(uint256 indexed listingId, uint256 indexed tokenId, address winner, uint256 amount);

    constructor(address initialOwner, address _creatureNFT, address _reputation) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        creatureNFT  = CreatureNFT(payable(_creatureNFT));
        reputation   = ReputationSystem(_reputation);
        feeRecipient = initialOwner; // overwritten to Treasury in deploy.js
    }

    // ── Listing ───────────────────────────────────────────────────────────────

    function listFixed(uint256 tokenId, uint256 price)
        external nonReentrant returns (uint256 listingId)
    {
        require(price > 0, "Marketplace: zero price");
        _takeCustody(tokenId);

        listingId = _nextListingId++;
        listings[listingId] = Listing({
            tokenId:       tokenId,
            seller:        msg.sender,
            price:         price,
            reservePrice:  0,
            auctionEnd:    0,
            highestBidder: address(0),
            highestBid:    0,
            listingType:   ListingType.FixedPrice,
            status:        ListingStatus.Active
        });
        activeListingOf[tokenId] = listingId;

        emit Listed(listingId, tokenId, msg.sender, price, 0, ListingType.FixedPrice, 0);
    }

    function listAuction(
        uint256 tokenId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 duration
    ) external nonReentrant returns (uint256 listingId) {
        require(startPrice > 0,                                                "Marketplace: zero start price");
        require(duration >= MIN_AUCTION_DURATION && duration <= MAX_AUCTION_DURATION, "Marketplace: invalid duration");
        // reservePrice must be >= startPrice if set
        require(reservePrice == 0 || reservePrice >= startPrice,              "Marketplace: reserve < start");
        _takeCustody(tokenId);

        uint256 end = block.timestamp + duration;
        listingId = _nextListingId++;
        listings[listingId] = Listing({
            tokenId:       tokenId,
            seller:        msg.sender,
            price:         startPrice,
            reservePrice:  reservePrice,
            auctionEnd:    end,
            highestBidder: address(0),
            highestBid:    0,
            listingType:   ListingType.Auction,
            status:        ListingStatus.Active
        });
        activeListingOf[tokenId] = listingId;

        emit Listed(listingId, tokenId, msg.sender, startPrice, reservePrice, ListingType.Auction, end);
    }

    // ── Batch listing (Feature 15) ─────────────────────────────────────────────

    /**
     * @notice List multiple creatures at fixed prices in a single transaction.
     *         Caller must have called creatureNFT.setApprovalForAll(marketplace, true) first.
     */
    function batchListFixed(uint256[] calldata tokenIds, uint256[] calldata prices)
        external nonReentrant returns (uint256[] memory listingIds)
    {
        require(tokenIds.length == prices.length, "Marketplace: length mismatch");
        require(tokenIds.length > 0,              "Marketplace: empty batch");

        listingIds = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(prices[i] > 0,                              "Marketplace: zero price");
            require(activeListingOf[tokenIds[i]] == 0,          "Marketplace: already listed");
            require(creatureNFT.ownerOf(tokenIds[i]) == msg.sender, "Marketplace: not owner");

            creatureNFT.transferFrom(msg.sender, address(this), tokenIds[i]);

            uint256 lid = _nextListingId++;
            listings[lid] = Listing({
                tokenId:       tokenIds[i],
                seller:        msg.sender,
                price:         prices[i],
                reservePrice:  0,
                auctionEnd:    0,
                highestBidder: address(0),
                highestBid:    0,
                listingType:   ListingType.FixedPrice,
                status:        ListingStatus.Active
            });
            activeListingOf[tokenIds[i]] = lid;
            listingIds[i] = lid;

            emit Listed(lid, tokenIds[i], msg.sender, prices[i], 0, ListingType.FixedPrice, 0);
        }
    }

    // ── Buying / Bidding ──────────────────────────────────────────────────────

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage l = listings[listingId];
        require(l.status == ListingStatus.Active,            "Marketplace: not active");
        require(l.listingType == ListingType.FixedPrice,     "Marketplace: use bid()");
        require(msg.value >= l.price,                        "Marketplace: insufficient ETH");
        require(msg.sender != l.seller,                      "Marketplace: seller cannot buy");

        address seller = l.seller;
        uint256 tokenId = l.tokenId;

        l.status = ListingStatus.Sold;
        activeListingOf[tokenId] = 0;

        _distribute(seller, tokenId, l.price);
        creatureNFT.transferFrom(address(this), msg.sender, tokenId);

        if (msg.value > l.price) payable(msg.sender).transfer(msg.value - l.price);

        _addRep(seller,     10, "Marketplace fixed sale");
        _addRep(msg.sender, 5,  "Marketplace purchase");

        emit Sold(listingId, tokenId, msg.sender, l.price);
    }

    /**
     * @notice Buy multiple fixed-price listings in one transaction.
     *         msg.value must cover the sum of all prices. Excess is refunded.
     */
    function batchBuy(uint256[] calldata listingIds) external payable nonReentrant {
        require(listingIds.length > 0, "Marketplace: empty batch");

        uint256 totalCost = 0;
        for (uint256 i = 0; i < listingIds.length; i++) {
            Listing storage l = listings[listingIds[i]];
            require(l.status == ListingStatus.Active,        "Marketplace: listing not active");
            require(l.listingType == ListingType.FixedPrice, "Marketplace: auctions not batchable");
            require(msg.sender != l.seller,                  "Marketplace: seller cannot buy own");
            totalCost += l.price;
        }
        require(msg.value >= totalCost, "Marketplace: insufficient ETH for batch");

        for (uint256 i = 0; i < listingIds.length; i++) {
            Listing storage l = listings[listingIds[i]];
            uint256 tokenId = l.tokenId;
            address seller  = l.seller;

            l.status = ListingStatus.Sold;
            activeListingOf[tokenId] = 0;

            _distribute(seller, tokenId, l.price);
            creatureNFT.transferFrom(address(this), msg.sender, tokenId);

            _addRep(seller,     10, "Marketplace fixed sale (batch)");
            _addRep(msg.sender, 5,  "Marketplace purchase (batch)");

            emit Sold(listingIds[i], tokenId, msg.sender, l.price);
        }

        if (msg.value > totalCost) payable(msg.sender).transfer(msg.value - totalCost);
    }

    function bid(uint256 listingId) external payable nonReentrant {
        Listing storage l = listings[listingId];
        require(l.status == ListingStatus.Active,       "Marketplace: not active");
        require(l.listingType == ListingType.Auction,   "Marketplace: use buy()");
        require(block.timestamp < l.auctionEnd,         "Marketplace: auction ended");
        require(msg.sender != l.seller,                 "Marketplace: seller cannot bid");

        uint256 minBid = l.highestBid == 0
            ? l.price
            : l.highestBid + (l.highestBid * MIN_BID_INCREMENT_BPS / 10000);

        require(msg.value >= minBid, "Marketplace: bid too low");

        // Refund previous highest bidder
        if (l.highestBidder != address(0)) {
            (bool ok,) = l.highestBidder.call{value: l.highestBid}("");
            require(ok, "Marketplace: refund failed");
        }

        l.highestBidder = msg.sender;
        l.highestBid    = msg.value;

        emit Bid(listingId, msg.sender, msg.value);
    }

    function finalizeAuction(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        require(l.status == ListingStatus.Active,       "Marketplace: not active");
        require(l.listingType == ListingType.Auction,   "Marketplace: not auction");
        require(block.timestamp >= l.auctionEnd,        "Marketplace: auction not ended");
        require(msg.sender == l.seller,                 "Marketplace: only seller can finalize");

        l.status = ListingStatus.Ended;
        activeListingOf[l.tokenId] = 0;

        // No bids, or reserve not met → return NFT to seller
        bool reserveMet = l.reservePrice == 0 || l.highestBid >= l.reservePrice;
        if (l.highestBidder == address(0) || !reserveMet) {
            if (l.highestBidder != address(0) && !reserveMet) {
                // Reserve not met: refund the highest bidder
                (bool ok,) = l.highestBidder.call{value: l.highestBid}("");
                require(ok, "Marketplace: refund failed");
            }
            creatureNFT.transferFrom(address(this), l.seller, l.tokenId);
            emit Cancelled(listingId, l.tokenId);
        } else {
            _distribute(l.seller, l.tokenId, l.highestBid);
            creatureNFT.transferFrom(address(this), l.highestBidder, l.tokenId);

            _addRep(l.seller,        10, "Auction sale");
            _addRep(l.highestBidder, 5,  "Auction win");

            emit AuctionFinalized(listingId, l.tokenId, l.highestBidder, l.highestBid);
        }
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        require(l.status == ListingStatus.Active, "Marketplace: not active");
        require(l.seller == msg.sender,            "Marketplace: not seller");
        if (l.listingType == ListingType.Auction) {
            require(l.highestBidder == address(0), "Marketplace: bids exist");
        }
        l.status = ListingStatus.Cancelled;
        activeListingOf[l.tokenId] = 0;
        creatureNFT.transferFrom(address(this), l.seller, l.tokenId);
        emit Cancelled(listingId, l.tokenId);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getActiveListings(uint256 from, uint256 count)
        external view returns (Listing[] memory result, uint256[] memory ids)
    {
        uint256 total = _nextListingId - 1;
        uint256 size = 0;
        for (uint256 i = from; i <= total && size < count; i++) {
            if (listings[i].status == ListingStatus.Active) size++;
        }
        result = new Listing[](size);
        ids    = new uint256[](size);
        uint256 idx = 0;
        for (uint256 i = from; i <= total && idx < size; i++) {
            if (listings[i].status == ListingStatus.Active) {
                result[idx] = listings[i];
                ids[idx]    = i;
                idx++;
            }
        }
    }

    function getListingCount() external view returns (uint256) {
        return _nextListingId - 1;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setPlatformFee(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps <= 1000, "Marketplace: max 10%");
        platformFeeBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyRole(ADMIN_ROLE) {
        require(recipient != address(0), "Marketplace: zero address");
        feeRecipient = recipient;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _takeCustody(uint256 tokenId) internal {
        require(creatureNFT.ownerOf(tokenId) == msg.sender, "Marketplace: not owner");
        require(activeListingOf[tokenId] == 0,              "Marketplace: already listed");
        creatureNFT.transferFrom(msg.sender, address(this), tokenId);
    }

    function _distribute(address seller, uint256 tokenId, uint256 salePrice) internal {
        (address royaltyRecipient, uint256 royaltyAmount) = creatureNFT.royaltyInfo(tokenId, salePrice);
        uint256 fee            = (salePrice * platformFeeBps) / 10000;
        uint256 sellerProceeds = salePrice - fee - royaltyAmount;
        bool sent;

        if (royaltyAmount > 0 && royaltyRecipient != address(0)) {
            (sent,) = royaltyRecipient.call{value: royaltyAmount}("");
            require(sent, "Marketplace: royalty transfer failed");
        }
        if (fee > 0 && feeRecipient != address(0)) {
            // Use call (not transfer) so Treasury's receive() gets full gas
            (sent,) = feeRecipient.call{value: fee}("");
            require(sent, "Marketplace: fee transfer failed");
        }
        (sent,) = seller.call{value: sellerProceeds}("");
        require(sent, "Marketplace: seller payment failed");
    }

    /** @dev try/catch so a reputation contract issue never blocks a sale. */
    function _addRep(address user, uint256 amount, string memory reason) internal {
        if (address(reputation) != address(0)) {
            try reputation.addReputation(user, amount, reason) {} catch {}
        }
    }
}
