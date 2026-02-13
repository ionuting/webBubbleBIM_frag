import type { Express, Request } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { extractIfcProperties } from "./ifc-processor";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve uploaded files statically if needed (optional, using specific route below instead)
  // app.use('/uploads', express.static(uploadDir));

  app.get(api.models.list.path, async (req, res) => {
    const models = await storage.getModels();
    res.json(models);
  });

  app.get(api.models.get.path, async (req, res) => {
    const model = await storage.getModel(Number(req.params.id));
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }
    res.json(model);
  });

  app.post(api.models.upload.path, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const model = await storage.createModel({
      name: req.body.name || req.file.originalname,
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });

    // Extract IFC properties in background (don't block the response)
    const filePath = path.join(uploadDir, req.file.filename);
    extractIfcProperties(filePath, model.id)
      .then(async (properties) => {
        await storage.createIfcProperties(properties);
        console.log(`✅ Saved ${properties.length} IFC properties for model ${model.id}`);
      })
      .catch((error) => {
        console.error(`❌ Failed to extract IFC properties for model ${model.id}:`, error);
      });

    res.status(201).json(model);
  });

  app.delete(api.models.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const model = await storage.getModel(id);
    
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // Delete file from disk
    const filePath = path.join(uploadDir, model.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await storage.deleteModel(id);
    res.status(204).send();
  });

  app.get(api.models.file.path, async (req, res) => {
    const model = await storage.getModel(Number(req.params.id));
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    const filePath = path.join(uploadDir, model.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.download(filePath, model.originalFilename);
  });

  // Get IFC properties for a specific expressId
  app.get(api.models.properties.path, async (req, res) => {
    const modelId = Number(req.params.id);
    const expressId = Number(req.params.expressId);

    const property = await storage.getIfcProperty(modelId, expressId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json(property.properties);
  });

  // Get all IFC properties for a model
  app.get(api.models.allProperties.path, async (req, res) => {
    const modelId = Number(req.params.id);
    const model = await storage.getModel(modelId);
    
    if (!model) {
      return res.status(404).json({ message: 'Model not found' });
    }

    const properties = await storage.getIfcProperties(modelId);
    res.json(properties);
  });

  return httpServer;
}

// Seed function - safe to run
async function seedDatabase() {
  const models = await storage.getModels();
  if (models.length === 0) {
    // No models to seed since they require files, but we could create placeholders
    // if we had sample files. For now, we leave it empty.
    console.log("Database initialized. Ready for uploads.");
  }
}

// Run seed (async, don't block)
seedDatabase().catch(console.error);
