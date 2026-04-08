import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ManagerDashboardScreen from '../screens/ManagerDashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ShiftsScreen from '../screens/ShiftsScreen';
import { ManagerTabParamList } from './types';
import { Text } from 'react-native';
import { useAppContext } from '../context/AppContext';

const Tab = createBottomTabNavigator<ManagerTabParamList>();

export default function ManagerTabs() {
  const { themeColors } = useAppContext();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: themeColors.faint,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={ManagerDashboardScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>📊</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Shifts"
        component={ShiftsScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>⚙️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}
