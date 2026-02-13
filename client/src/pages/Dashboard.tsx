import { useModels } from "@/hooks/use-models";
import { Navigation } from "@/components/Navigation";
import { ModelCard } from "@/components/ModelCard";
import { UploadDialog } from "@/components/UploadDialog";
import { Loader2, Box, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Dashboard() {
  const { data: models, isLoading, isError } = useModels();
  const [search, setSearch] = useState("");

  const filteredModels = models?.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.originalFilename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground font-body selection:bg-primary/20">
      <Navigation />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                Dashboard
              </h1>
              <p className="text-lg text-muted-foreground font-light max-w-2xl">
                Manage your BIM projects and visualize IFC models in real-time.
              </p>
            </div>
            <UploadDialog />
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="Search models..." 
                className="pl-10 h-11 bg-background border-border focus:ring-primary/20 focus:border-primary text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto text-sm text-muted-foreground px-2">
              <span className="font-medium text-foreground">{filteredModels?.length || 0}</span> models found
            </div>
          </div>

          {/* Models Grid */}
          {isLoading ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground animate-pulse">
              <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
              <p>Loading your models...</p>
            </div>
          ) : isError ? (
            <div className="h-[300px] bg-destructive/5 border border-destructive/20 rounded-3xl flex flex-col items-center justify-center text-destructive p-8 text-center">
              <p className="font-semibold text-lg mb-2">Something went wrong</p>
              <p className="text-sm opacity-80">Failed to load models. Please check your connection and try again.</p>
            </div>
          ) : filteredModels?.length === 0 ? (
            <div className="h-[400px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-card/20 p-8">
              <div className="h-20 w-20 bg-secondary rounded-full flex items-center justify-center mb-6">
                <Box className="h-10 w-10 opacity-50" />
              </div>
              <h3 className="text-xl font-bold font-display text-foreground mb-2">No models found</h3>
              <p className="text-center max-w-md mb-8">
                {search ? "No results matching your search terms." : "Get started by uploading your first IFC model to visualize it in 3D."}
              </p>
              {!search && <UploadDialog />}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
              {filteredModels?.map((model) => (
                <ModelCard key={model.id} model={model} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
