import { useState, useRef } from "react";
import { Upload, X, File as FileIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadModel } from "@/hooks/use-models";
import { useToast } from "@/hooks/use-toast";

export function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { mutate: uploadModel, isPending } = useUploadModel();
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.name.toLowerCase().endsWith('.ifc')) {
        setFile(selectedFile);
        if (!name) {
          setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
        }
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a .ifc file",
          variant: "destructive",
        });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);

    uploadModel(formData, {
      onSuccess: () => {
        setOpen(false);
        setFile(null);
        setName("");
        toast({
          title: "Upload successful",
          description: "Your model is now processing and will appear shortly.",
        });
      },
      onError: (error) => {
        toast({
          title: "Upload failed",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/25 rounded-xl">
          <Upload className="mr-2 h-5 w-5" />
          Upload IFC
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Upload New Model</DialogTitle>
          <DialogDescription>
            Upload an Industry Foundation Classes (.ifc) file to view in 3D.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name">Model Name</Label>
            <Input
              id="name"
              placeholder="e.g. Office Building Phase 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div 
            className={`border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer ${
              file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/50"
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".ifc" 
              onChange={handleFileChange}
            />
            
            {file ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in duration-200">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 text-primary">
                  <FileIcon className="h-6 w-6" />
                </div>
                <p className="font-medium text-sm truncate max-w-[200px] text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="mt-3 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setName("");
                  }}
                >
                  <X className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-muted-foreground">
                <Upload className="h-10 w-10 mb-3 opacity-50" />
                <p className="text-sm font-medium mb-1">Drag & drop your .ifc file</p>
                <p className="text-xs opacity-70">or click to browse files</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-primary text-primary-foreground font-semibold min-w-[100px]"
              disabled={!file || !name || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Model"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
