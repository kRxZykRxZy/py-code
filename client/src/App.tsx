import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home, { PortfolioPreview } from "./pages/Home";

function PublicPortfolioRoute() { return <PortfolioPreview />; }

function GitFolioBranding() {
  useEffect(() => {
    const replaceBrand = (value: string) => value.replaceAll("GitHubFolio", "GitFolio").replaceAll("githubfolio.com", "gitfolio.com");
    const applyBranding = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      while (current) {
        if (current.nodeValue) current.nodeValue = replaceBrand(current.nodeValue);
        current = walker.nextNode();
      }
    };
    applyBranding(document.body);
    const observer = new MutationObserver(records => records.forEach(record => {
      if (record.type === "characterData" && record.target.nodeValue) record.target.nodeValue = replaceBrand(record.target.nodeValue);
      record.addedNodes.forEach(node => applyBranding(node));
    }));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function Router() {
  return <Switch>
    <Route path={"/"} component={Home} />
      <Route path={"/:username"} component={PublicPortfolioRoute} />
    <Route path="/dashboard" component={Home} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><GitFolioBranding /><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
