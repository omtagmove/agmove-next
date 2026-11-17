import React from "react";
import { createRoot } from "react-dom/client";
import RoverExperience from "./RoverExperience.jsx";

export function mountRoverExperience(host, assets) {
  const root = createRoot(host);
  root.render(<RoverExperience initialAssets={assets} />);
  return () => root.unmount();
}
