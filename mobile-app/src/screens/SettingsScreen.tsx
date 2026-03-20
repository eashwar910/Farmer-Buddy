import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const { language, setLanguage, theme, setTheme, themeColors, t } = useAppContext();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const isDark = theme === 'dark';

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('settings')}</Text>

        {/* Profile Info */}
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{profile?.name || '-'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>
            {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '-'}
          </Text>
        </View>

        {/* Language Section */}
        <Text style={styles.sectionHeader}>{t('language')} / Bahasa</Text>
        <View style={styles.card}>
          <TouchableOpacity 
            style={styles.row} 
            onPress={() => setLanguage('en')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.emoji}>🇬🇧</Text>
              <Text style={[styles.value, language === 'en' && { color: themeColors.accent }]}>{t('english')}</Text>
            </View>
            {language === 'en' && <MaterialCommunityIcons name="check" size={24} color={themeColors.accent} />}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity 
            style={styles.row} 
            onPress={() => setLanguage('ms')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.emoji}>🇲🇾</Text>
              <Text style={[styles.value, language === 'ms' && { color: themeColors.accent }]}>{t('malay')}</Text>
            </View>
            {language === 'ms' && <MaterialCommunityIcons name="check" size={24} color={themeColors.accent} />}
          </TouchableOpacity>
        </View>

        {/* Appearance Section */}
        <Text style={styles.sectionHeader}>{t('theme')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.value}>{t('darkMode')}</Text>
            <Switch
              value={isDark}
              onValueChange={(val) => setTheme(val ? 'dark' : 'light')}
              trackColor={{ false: '#767577', true: themeColors.accent }}
              thumbColor={'#fff'}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footerText}>SmartAgro v1.0.0 — Built for Malaysian Farmers</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.subtext,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  card: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: themeColors.border,
    marginVertical: 4,
  },
  label: {
    fontSize: 12,
    color: themeColors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: themeColors.text,
    fontWeight: '500',
  },
  signOutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
  },
  footerText: {
    textAlign: 'center',
    color: themeColors.subtext,
    fontSize: 12,
    marginTop: 32,
    fontStyle: 'italic',
  },
});
