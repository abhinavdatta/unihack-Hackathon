"use client";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/app.js";
    document.body.appendChild(script);
  }, []);

  return <div id="app"></div>;
}
