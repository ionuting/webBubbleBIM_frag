import { useState } from "react";

interface ViewCubeProps {
  onViewChange: (position: [number, number, number], target?: [number, number, number]) => void;
}

type ViewFace = "top" | "bottom" | "front" | "back" | "left" | "right" | "iso";

export function ViewCube({ onViewChange }: ViewCubeProps) {
  const [hoveredFace, setHoveredFace] = useState<ViewFace | null>(null);

  const distance = 50; // Distance from center

  const views: Record<ViewFace, { position: [number, number, number]; label: string }> = {
    top: { position: [0, distance, 0], label: "TOP" },
    bottom: { position: [0, -distance, 0], label: "BOTTOM" },
    front: { position: [0, 0, distance], label: "FRONT" },
    back: { position: [0, 0, -distance], label: "BACK" },
    left: { position: [-distance, 0, 0], label: "LEFT" },
    right: { position: [distance, 0, 0], label: "RIGHT" },
    iso: { position: [distance, distance, distance], label: "ISO" },
  };

  const handleFaceClick = (face: ViewFace) => {
    const view = views[face];
    onViewChange(view.position, [0, 0, 0]);
  };

  return (
    <div className="viewcube-container">
      {/* Main Cube */}
      <div className="viewcube">
        {/* Top Face */}
        <button
          className={`viewcube-face viewcube-face-top ${hoveredFace === "top" ? "viewcube-face-hover" : ""}`}
          onMouseEnter={() => setHoveredFace("top")}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => handleFaceClick("top")}
          title="Top View"
        >
          <span className="viewcube-label">T</span>
        </button>

        {/* Front Face */}
        <button
          className={`viewcube-face viewcube-face-front ${hoveredFace === "front" ? "viewcube-face-hover" : ""}`}
          onMouseEnter={() => setHoveredFace("front")}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => handleFaceClick("front")}
          title="Front View"
        >
          <span className="viewcube-label">F</span>
        </button>

        {/* Right Face */}
        <button
          className={`viewcube-face viewcube-face-right ${hoveredFace === "right" ? "viewcube-face-hover" : ""}`}
          onMouseEnter={() => setHoveredFace("right")}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => handleFaceClick("right")}
          title="Right View"
        >
          <span className="viewcube-label">R</span>
        </button>
      </div>

      {/* Quick View Buttons */}
      <div className="viewcube-buttons">
        <button
          className="viewcube-btn"
          onClick={() => handleFaceClick("iso")}
          title="Isometric View"
        >
          ISO
        </button>
        <button
          className="viewcube-btn"
          onClick={() => handleFaceClick("back")}
          title="Back View"
        >
          B
        </button>
        <button
          className="viewcube-btn"
          onClick={() => handleFaceClick("left")}
          title="Left View"
        >
          L
        </button>
        <button
          className="viewcube-btn"
          onClick={() => handleFaceClick("bottom")}
          title="Bottom View"
        >
          ↓
        </button>
      </div>

      <style>{`
        .viewcube-container {
          position: relative;
          width: 120px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .viewcube {
          width: 80px;
          height: 80px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(-20deg) rotateY(-30deg);
          margin: 0 auto;
        }

        .viewcube-face {
          position: absolute;
          width: 80px;
          height: 80px;
          background: rgba(30, 30, 40, 0.9);
          border: 2px solid rgba(100, 100, 120, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        }

        .viewcube-face:hover,
        .viewcube-face-hover {
          background: rgba(59, 130, 246, 0.8);
          border-color: rgba(59, 130, 246, 1);
          transform: scale(1.05);
          z-index: 10;
        }

        .viewcube-label {
          color: white;
          font-weight: bold;
          font-size: 20px;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .viewcube-face-top {
          transform: rotateX(90deg) translateZ(40px);
        }

        .viewcube-face-front {
          transform: translateZ(40px);
        }

        .viewcube-face-right {
          transform: rotateY(90deg) translateZ(40px);
        }

        .viewcube-buttons {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px;
        }

        .viewcube-btn {
          padding: 6px 8px;
          background: rgba(30, 30, 40, 0.9);
          border: 1px solid rgba(100, 100, 120, 0.6);
          color: white;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        }

        .viewcube-btn:hover {
          background: rgba(59, 130, 246, 0.8);
          border-color: rgba(59, 130, 246, 1);
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
