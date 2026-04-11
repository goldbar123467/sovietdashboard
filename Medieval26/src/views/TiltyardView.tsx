import React, { useEffect, useRef } from 'react';
import { renderer, camera, controls } from '@/scene/setup';
import { placeKnights } from '@/scene/knight3d';
import { gameState } from '@/state';

export function TiltyardView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = renderer.domElement;

    // Reset positioning - let the container control layout
    canvas.style.position = 'static';
    canvas.style.left = '';
    canvas.style.top = '';
    canvas.style.display = 'block';

    container.appendChild(canvas);

    // Resize to fit container
    const rect = container.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);

    // Set camera position
    camera.position.set(14, 9, 20);
    controls.target.set(0, 1, 0);
    controls.update();

    // Place knights
    const sel = gameState.roster[0];
    if (sel && gameState.currentOpponent) {
      placeKnights(sel, gameState.currentOpponent);
    }

    return () => {
      // Move canvas back to body but hidden
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden" />
  );
}
