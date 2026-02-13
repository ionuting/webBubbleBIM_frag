import { Link, useLocation } from "wouter";
import { Box, Layers, LayoutGrid, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navigation() {
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border hidden md:flex flex-col z-50">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/20">
            <Box className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight">OpenBIM</h1>
            <p className="text-xs text-muted-foreground font-medium">Model Viewer</p>
          </div>
        </div>

        <div className="space-y-2">
          <Link href="/">
            <Button
              variant={isActive("/") ? "secondary" : "ghost"}
              className={`w-full justify-start gap-3 h-12 font-medium ${
                isActive("/") ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-5 w-5" />
              Dashboard
            </Button>
          </Link>
          
          <Button
            variant="ghost"
            disabled
            className="w-full justify-start gap-3 h-12 font-medium text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Layers className="h-5 w-5" />
            Projects <span className="ml-auto text-[10px] bg-background px-1.5 py-0.5 rounded border border-border">SOON</span>
          </Button>

          <Button
            variant="ghost"
            disabled
            className="w-full justify-start gap-3 h-12 font-medium text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Settings className="h-5 w-5" />
            Settings
          </Button>
        </div>
      </div>

      <div className="mt-auto p-6 border-t border-border/50">
        <div className="bg-gradient-to-br from-primary/20 to-transparent p-4 rounded-xl border border-primary/10">
          <h4 className="font-semibold text-sm mb-1 text-primary">Pro Version</h4>
          <p className="text-xs text-muted-foreground mb-3">Unlock cloud collaboration features.</p>
          <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold">
            Upgrade Plan
          </Button>
        </div>
      </div>
    </nav>
  );
}
