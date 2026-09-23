'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from '../theme/tokens';

/**
 * Drives a tile's "3D" hover feel: as the cursor moves across the element it rotates toward the
 * cursor (perspective tilt), and settles back flat with a smooth ease on mouse-leave. Shared by
 * every app tile (Home's category/recent tiles, AppCard) so they all tilt the same way.
 *
 * Usage: spread `handlers` onto the element, attach `ref`, and fold `transform` into that same
 * element's inline style, e.g. `transform: \`${tilt.transform} scale(${scale})\``.
 */
export function useTiltHover<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setRotate({ x: -py * 2 * motion.tiltMaxDeg, y: px * 2 * motion.tiltMaxDeg });
  }, []);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => {
    setHovered(false);
    setPressed(false);
    setRotate({ x: 0, y: 0 });
  }, []);
  const onMouseDown = useCallback(() => setPressed(true), []);
  const onMouseUp = useCallback(() => setPressed(false), []);
  const onBlur = useCallback(() => setPressed(false), []);

  return {
    ref,
    hovered,
    pressed,
    /** `perspective(...) rotateX(...) rotateY(...)` — prepend to any additional
     * scale/translate transforms, and keep `transformStyle: 'preserve-3d'` alongside it. */
    tiltTransform: `perspective(${motion.tiltPerspective}px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
    handlers: { onMouseMove, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, onBlur },
  };
}
