import { registerGlobals } from '@livekit/react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/hooks/useAuth';
import { ShiftProvider } from './src/hooks/useShift';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';

registerGlobals();

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <ShiftProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </ShiftProvider>
      </AuthProvider>
    </AppProvider>
  );
}
