import { createContext, useContext, useEffect, useState } from 'react';

const PortalContext = createContext(null);

/**
 * Renders overlay content above the whole app in the same window
 * (unlike Modal, which opens a new Android window and steals in-flight touches).
 */
export function PortalProvider({ children }) {
  const [node, setNode] = useState(null);
  return (
    <PortalContext.Provider value={setNode}>
      {children}
      {node}
    </PortalContext.Provider>
  );
}

export function Portal({ children }) {
  const setNode = useContext(PortalContext);
  useEffect(() => {
    setNode(children);
  }, [children, setNode]);
  useEffect(() => () => setNode(null), [setNode]);
  return null;
}
