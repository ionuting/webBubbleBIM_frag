import { ModelResponse } from "@shared/schema";
import { format } from "date-fns";
import { Box, Calendar, FileText, Trash2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteModel } from "@/hooks/use-models";
import { useToast } from "@/hooks/use-toast";

interface ModelCardProps {
  model: ModelResponse;
}

export function ModelCard({ model }: ModelCardProps) {
  const { mutate: deleteModel, isPending: isDeleting } = useDeleteModel();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteModel(model.id, {
      onSuccess: () => {
        toast({
          title: "Model deleted",
          description: "The IFC model has been permanently removed.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="group relative bg-card hover:bg-card/80 border border-border hover:border-primary/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
      {/* Icon Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 group-hover:border-primary/30 transition-colors">
          <Box className="h-6 w-6 text-primary" />
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Delete Model?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{model.name}" and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Content */}
      <div className="mb-6">
        <h3 className="font-display font-bold text-lg text-foreground mb-1 truncate pr-2" title={model.name}>
          {model.name}
        </h3>
        <p className="text-sm text-muted-foreground font-medium truncate mb-4" title={model.originalFilename}>
          {model.originalFilename}
        </p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground/80">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span>{formatSize(model.size)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{model.createdAt ? format(new Date(model.createdAt), "MMM d, yyyy") : "Unknown"}</span>
          </div>
        </div>
      </div>

      {/* Action */}
      <Link href={`/viewer/${model.id}`} className="block">
        <Button className="w-full bg-secondary hover:bg-primary hover:text-white text-secondary-foreground font-semibold rounded-xl border border-border hover:border-primary/50 transition-all duration-300 group-hover:shadow-md">
          Open Viewer
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </Link>
    </div>
  );
}
