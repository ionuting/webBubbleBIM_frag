import { pgTable, text, serial, integer, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(), // The saved filename on disk
  originalFilename: text("original_filename").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ifcProperties = pgTable("ifc_properties", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  expressId: integer("express_id").notNull(),
  properties: jsonb("properties").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertModelSchema = createInsertSchema(models).omit({ 
  id: true, 
  createdAt: true 
});

export const insertIfcPropertySchema = createInsertSchema(ifcProperties).omit({
  id: true,
  createdAt: true,
});

export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type CreateModelRequest = InsertModel;
export type ModelResponse = Model;

export type IfcProperty = typeof ifcProperties.$inferSelect;
export type InsertIfcProperty = z.infer<typeof insertIfcPropertySchema>;
