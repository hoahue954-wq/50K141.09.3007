import React, { createContext, useContext, useState } from 'react';
import { Product } from '../types';

export interface POSCartItem {
  product: Product;
  quantity: number;
}

interface POSDraftContextValue {
  cart: POSCartItem[];
  setCart: React.Dispatch<React.SetStateAction<POSCartItem[]>>;
}

const POSDraftContext = createContext<POSDraftContextValue | undefined>(undefined);

export const POSDraftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<POSCartItem[]>([]);

  return (
    <POSDraftContext.Provider value={{ cart, setCart }}>
      {children}
    </POSDraftContext.Provider>
  );
};

export const usePOSDraft = (): POSDraftContextValue => {
  const context = useContext(POSDraftContext);
  if (!context) {
    throw new Error('usePOSDraft must be used within a POSDraftProvider');
  }
  return context;
};
