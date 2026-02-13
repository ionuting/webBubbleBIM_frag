import { X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

interface Property {
  name: string;
  value: string | number | boolean;
}

interface PropertySet {
  name: string;
  properties: Property[];
}

interface PropertiesPanelProps {
  title: string;
  type?: string;
  expressID?: number;
  propertySets?: PropertySet[];
  onClose: () => void;
}

function PropertySetSection({ name, properties, defaultOpen = false }: PropertySet & { defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
      >
        <span className="font-medium text-sm">{name}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          {properties.map((prop, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-muted-foreground truncate" title={prop.name}>
                {prop.name}
              </span>
              <span className="font-mono text-foreground truncate" title={String(prop.value)}>
                {String(prop.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PropertiesPanel({ title, type, expressID, propertySets = [], onClose }: PropertiesPanelProps) {
  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl z-20 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="flex items-start justify-between mb-2">
          <h2 className="font-display font-bold text-lg">Properties</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium truncate" title={title}>
            {title}
          </p>
          {type && (
            <p className="text-xs text-muted-foreground font-mono">{type}</p>
          )}
          {expressID !== undefined && (
            <p className="text-xs text-muted-foreground">
              Express ID: <span className="font-mono">{expressID}</span>
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {propertySets.length > 0 ? (
          <div className="divide-y divide-border/30">
            {propertySets.map((pset, idx) => (
              <PropertySetSection
                key={idx}
                name={pset.name}
                properties={pset.properties}
                defaultOpen={idx === 0}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-muted-foreground text-sm space-y-2">
              <p className="font-medium">No properties available</p>
              <p className="text-xs">
                This object may not have IFC properties or they could not be loaded.
              </p>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-border/50 bg-accent/30">
        <p className="text-xs text-muted-foreground text-center">
          IFC Property Viewer
        </p>
      </div>
    </div>
  );
}
