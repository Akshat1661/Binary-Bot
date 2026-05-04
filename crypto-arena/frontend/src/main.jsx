import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#111128",
            color: "#fff",
            border: "1px solid #1e1e3f",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "13px",
          },
          success: { iconTheme: { primary: "#10b981", secondary: "#111128" } },
          error:   { iconTheme: { primary: "#ef4444", secondary: "#111128" } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
