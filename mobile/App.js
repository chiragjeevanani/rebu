import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { GiftFxProvider } from './src/components/GiftFx';
import { PortalProvider } from './src/components/Portal';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <GiftFxProvider>
          <PortalProvider>
            <RootNavigator />
          </PortalProvider>
        </GiftFxProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
