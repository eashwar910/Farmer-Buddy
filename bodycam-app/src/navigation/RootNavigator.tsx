import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AuthStack from './AuthStack';
import ManagerTabs from './ManagerTabs';
import EmployeeTabs from './EmployeeTabs';
import RecordingsListScreen from '../screens/RecordingsListScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const isLoggedIn = !!session;
  const isManager = profile?.role === 'manager';
  const isEmployee = profile?.role === 'employee';

  // Logged in but no role assigned yet
  if (isLoggedIn && !isManager && !isEmployee) {
    return (
      <View style={styles.loading}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <Text style={styles.pendingTitle}>Role Not Assigned</Text>
        <Text style={styles.pendingText}>
          Your account has been created but a role has not been assigned yet.
          Please contact your administrator.
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#0F172A' },
        headerTintColor: '#F8FAFC',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : isManager ? (
        <Stack.Screen name="ManagerTabs" component={ManagerTabs} />
      ) : (
        <Stack.Screen name="EmployeeTabs" component={EmployeeTabs} />
      )}
      {/* Shared screens accessible from any tab */}
      <Stack.Screen
        name="RecordingsList"
        component={RecordingsListScreen}
        options={{ headerShown: true, title: 'Recordings' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pendingIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  pendingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  pendingText: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
  },
});
