import { type CreateModelRequest, type Model, type IfcProperty, type InsertIfcProperty } from "@shared/schema";

export interface IStorage {
  getModels(): Promise<Model[]>;
  getModel(id: number): Promise<Model | undefined>;
  createModel(model: CreateModelRequest): Promise<Model>;
  deleteModel(id: number): Promise<void>;
  // IFC Properties
  createIfcProperty(property: InsertIfcProperty): Promise<IfcProperty>;
  createIfcProperties(properties: InsertIfcProperty[]): Promise<IfcProperty[]>;
  getIfcProperty(modelId: number, expressId: number): Promise<IfcProperty | undefined>;
  getIfcProperties(modelId: number): Promise<IfcProperty[]>;
  deleteIfcProperties(modelId: number): Promise<void>;
}

// In-memory storage for development without database
export class MemoryStorage implements IStorage {
  private models: Map<number, Model> = new Map();
  private ifcProperties: Map<string, IfcProperty> = new Map(); // key: `${modelId}-${expressId}`
  private nextId: number = 1;
  private nextPropertyId: number = 1;

  constructor() {
    // Add some mock data for testing
    this.models.set(1, {
      id: 1,
      name: "Sample BIM Model",
      filename: "sample_model.ifc",
      originalFilename: "sample_model.ifc",
      size: 450,
      mimeType: "application/ifc",
      createdAt: new Date(),
    });
  }

  async getModels(): Promise<Model[]> {
    return Array.from(this.models.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async getModel(id: number): Promise<Model | undefined> {
    return this.models.get(id);
  }

  async createModel(insertModel: CreateModelRequest): Promise<Model> {
    const model: Model = {
      ...insertModel,
      id: this.nextId++,
      createdAt: new Date(),
    };
    this.models.set(model.id, model);
    return model;
  }

  async deleteModel(id: number): Promise<void> {
    this.models.delete(id);
    // Delete associated properties
    await this.deleteIfcProperties(id);
  }

  async createIfcProperty(property: InsertIfcProperty): Promise<IfcProperty> {
    const ifcProperty: IfcProperty = {
      ...property,
      id: this.nextPropertyId++,
      createdAt: new Date(),
    };
    const key = `${property.modelId}-${property.expressId}`;
    this.ifcProperties.set(key, ifcProperty);
    return ifcProperty;
  }

  async createIfcProperties(properties: InsertIfcProperty[]): Promise<IfcProperty[]> {
    const created: IfcProperty[] = [];
    for (const property of properties) {
      created.push(await this.createIfcProperty(property));
    }
    return created;
  }

  async getIfcProperty(modelId: number, expressId: number): Promise<IfcProperty | undefined> {
    const key = `${modelId}-${expressId}`;
    return this.ifcProperties.get(key);
  }

  async getIfcProperties(modelId: number): Promise<IfcProperty[]> {
    return Array.from(this.ifcProperties.values()).filter(
      (prop) => prop.modelId === modelId
    );
  }

  async deleteIfcProperties(modelId: number): Promise<void> {
    const keys = Array.from(this.ifcProperties.keys()).filter((key) =>
      key.startsWith(`${modelId}-`)
    );
    keys.forEach((key) => this.ifcProperties.delete(key));
  }
}

export const storage = new MemoryStorage();
