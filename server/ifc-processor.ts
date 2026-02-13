import * as WebIFC from "web-ifc";
import fs from "fs";
import { type InsertIfcProperty } from "@shared/schema";

interface IfcPropertyData {
  expressId: number;
  properties: Record<string, any>;
}

/**
 * Process an IFC file and extract all properties for each element
 */
export async function extractIfcProperties(
  filePath: string,
  modelId: number
): Promise<InsertIfcProperty[]> {
  const ifcApi = new WebIFC.IfcAPI();

  try {
    // Initialize the API
    await ifcApi.Init();

    // Read the IFC file
    const ifcData = fs.readFileSync(filePath);

    // Open the model
    const modelID = ifcApi.OpenModel(ifcData);

    // Get all lines (elements) in the IFC file
    const allLines = ifcApi.GetAllLines(modelID);
    
    const properties: InsertIfcProperty[] = [];
    
    console.log(`📋 Processing ${allLines.size()} IFC elements...`);
    
    // Iterate through all elements and extract properties
    for (let i = 0; i < allLines.size(); i++) {
      const expressID = allLines.get(i);
      
      try {
        // Get properties for this element
        const props = ifcApi.GetLine(modelID, expressID);
        
        if (props) {
          // Convert properties to a plain object
          const propsData: Record<string, any> = {};
          
          // Extract all properties from the IFC element
          Object.keys(props).forEach((key) => {
            const value = props[key];
            if (value !== null && value !== undefined) {
              // Handle different value types
              if (typeof value === "object" && value.value !== undefined) {
                propsData[key] = value.value;
              } else {
                propsData[key] = value;
              }
            }
          });
          
          properties.push({
            modelId,
            expressId: expressID,
            properties: propsData,
          });
        }
      } catch (err) {
        console.warn(`⚠️  Failed to extract properties for expressID ${expressID}:`, err);
      }
    }
    
    // Close the model
    ifcApi.CloseModel(modelID);
    
    console.log(`✅ Extracted properties for ${properties.length} IFC elements`);
    
    return properties;
  } catch (error) {
    console.error("❌ Error processing IFC file:", error);
    throw error;
  }
}
