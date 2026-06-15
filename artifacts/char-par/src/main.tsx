import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  setAuthTokenGetter,
  setBaseUrl
} from "@workspace/api-client-react";

import { useAuthStore } from "./store/authStore";

// Wire up auth token for all API calls

setBaseUrl(import.meta.env.VITE_API_URL);

setAuthTokenGetter(() => useAuthStore.getState().token);

createRoot(document.getElementById("root")!).render(<App />);
