import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';

export default function HomeScreen({ navigation }: any) {
  const { profile, user, refreshProfile } = useAuth();
  const [updatingRole, setUpdatingRole] = useState(false);

  const handleBodycamPress = async () => {
    // If they already have a role, just navigate directly
    if (profile?.role) {
      if (profile.role === 'manager') {
        navigation.replace('ManagerTabs');
      } else {
        navigation.replace('EmployeeTabs');
      }
      return;
    }

    // No role yet — assign "employee" and navigate
    setUpdatingRole(true);
    try {
      if (user) {
        const { error } = await supabase
          .from('users')
          .update({ role: 'employee' })
          .eq('id', user.id);

        if (error) throw error;
        // Refresh profile in background, but navigate immediately
        refreshProfile().catch(console.error);
        navigation.replace('EmployeeTabs');
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Could not update role. Please try again.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleManagerPress = async () => {
    setUpdatingRole(true);
    try {
      if (user) {
        const { error } = await supabase
          .from('users')
          .update({ role: 'manager' })
          .eq('id', user.id);

        if (error) throw error;
        // Refresh profile in background, but navigate immediately
        refreshProfile().catch(console.error);
        navigation.replace('ManagerTabs');
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Could not update role. Please try again.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleLeafDetectionPress = () => {
    navigation.navigate('LeafDetection');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to SmartAgro</Text>
        <Text style={styles.subtitle}>Select a feature to continue</Text>
      </View>

      <View style={styles.cardContainer}>
        <TouchableOpacity style={styles.card} onPress={handleBodycamPress} disabled={updatingRole}>
          {updatingRole ? (
            <ActivityIndicator size="large" color="#3B82F6" style={{ marginBottom: 12 }} />
          ) : (
            <Text style={styles.cardIcon}>📹</Text>
          )}
          <Text style={styles.cardTitle}>Bodycam App</Text>
          <Text style={styles.cardDescription}>Employee monitoring and live streaming</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.leafCard]} onPress={handleLeafDetectionPress} disabled={updatingRole}>
          <Text style={styles.cardIcon}>🌿</Text>
          <Text style={styles.cardTitle}>Leaf Disease Detection</Text>
          <Text style={styles.cardDescription}>Upload a leaf image to detect diseases using AI</Text>
        </TouchableOpacity>
      </View>

      {/* Show Manager option only if no role assigned yet */}
      {!profile?.role && !updatingRole && (
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleManagerPress}>
            <Text style={styles.managerText}>If you are a manager, click this</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 24,
  },
  header: {
    marginTop: 60,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
  },
  cardContainer: {
    gap: 20,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  leafCard: {
    borderColor: '#10B981',
  },
  cardIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    marginTop: 'auto',
    marginBottom: 20,
    alignItems: 'center',
  },
  managerText: {
    color: '#94A3B8',
    fontSize: 14,
    textDecorationLine: 'underline',
    padding: 8,
  },
});
