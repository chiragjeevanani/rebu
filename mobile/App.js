import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { GiftFxProvider } from './src/components/GiftFx';
import { PortalProvider } from './src/components/Portal';

export default function App() {
  return (
    // The stack navigator's swipe-back gesture needs this root.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <GiftFxProvider>
            <PortalProvider>
              <RootNavigator />
            </PortalProvider>
          </GiftFxProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
