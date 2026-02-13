import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useModels() {
  return useQuery({
    queryKey: [api.models.list.path],
    queryFn: async () => {
      const res = await fetch(api.models.list.path);
      if (!res.ok) throw new Error("Failed to fetch models");
      return api.models.list.responses[200].parse(await res.json());
    },
  });
}

export function useModel(id: number) {
  return useQuery({
    queryKey: [api.models.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.models.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch model");
      return api.models.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useUploadModel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.models.upload.path, {
        method: api.models.upload.method,
        body: formData,
        // Content-Type is set automatically by browser with boundary for FormData
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.models.upload.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Upload failed");
      }
      return api.models.upload.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.list.path] });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.models.delete.path, { id });
      const res = await fetch(url, { method: api.models.delete.method });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("Model not found");
        throw new Error("Failed to delete model");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.list.path] });
    },
  });
}
