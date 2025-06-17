import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../config/firebase';

export default function SettingsScreen({ navigation }) {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    lowStockAlerts: true,
    currency: '₱',
    lowStockThreshold: '10',
    refreshInterval: '1',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const settingsRef = db.collection('settings').doc(user.uid);
      const doc = await settingsRef.get();

      if (doc.exists) {
        setSettings(doc.data());
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const settingsRef = db.collection('settings').doc(user.uid);
      await settingsRef.set(settings);
      Alert.alert('Success', 'Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      {/* User Preferences Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>User Preferences</Text>
        </View>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Email Notifications</Text>
            <Text style={styles.settingDescription}>
              Receive updates about your inventory via email
            </Text>
          </View>
          <Switch
            value={settings.emailNotifications}
            onValueChange={(value) => setSettings({...settings, emailNotifications: value})}
            trackColor={{ false: '#e0e0e0', true: '#007AFF' }}
            thumbColor={settings.emailNotifications ? '#fff' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Low Stock Alerts</Text>
            <Text style={styles.settingDescription}>
              Get notified when items are running low
            </Text>
          </View>
          <Switch
            value={settings.lowStockAlerts}
            onValueChange={(value) => setSettings({...settings, lowStockAlerts: value})}
            trackColor={{ false: '#e0e0e0', true: '#007AFF' }}
            thumbColor={settings.lowStockAlerts ? '#fff' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Default Currency</Text>
            <Text style={styles.settingDescription}>
              Currency used for all monetary values
            </Text>
          </View>
          <View style={styles.currencyBadge}>
            <Text style={styles.currencyText}>Philippine Peso (₱)</Text>
          </View>
        </View>
      </View>

      {/* System Settings Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="settings-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>System Settings</Text>
        </View>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Low Stock Threshold</Text>
            <Text style={styles.settingDescription}>
              Minimum number of items before triggering low stock alert
            </Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={settings.lowStockThreshold}
              onChangeText={(value) => setSettings({...settings, lowStockThreshold: value})}
              keyboardType="numeric"
              placeholder="Enter threshold"
            />
            <Text style={styles.inputUnit}>items</Text>
          </View>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Data Refresh Interval</Text>
            <Text style={styles.settingDescription}>
              How often the app updates inventory data
            </Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={settings.refreshInterval}
              onChangeText={(value) => setSettings({...settings, refreshInterval: value})}
              keyboardType="numeric"
              placeholder="Enter minutes"
            />
            <Text style={styles.inputUnit}>minutes</Text>
          </View>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <TouchableOpacity 
          style={styles.accountButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={styles.accountButtonContent}>
            <Ionicons name="person-circle-outline" size={24} color="#007AFF" />
            <Text style={styles.accountButtonText}>View Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#007AFF" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.accountButton, styles.logoutButton]}
          onPress={() => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: () => auth.signOut(),
                },
              ]
            );
          }}
        >
          <View style={styles.accountButtonContent}>
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            <Text style={[styles.accountButtonText, styles.logoutButtonText]}>Logout</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveSettings}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Ionicons name="save-outline" size={20} color="white" style={styles.saveButtonIcon} />
            <Text style={styles.saveButtonText}>Save Settings</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    paddingTop: 20,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerRight: {
    width: 40,
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    width: 80,
    textAlign: 'center',
    fontSize: 16,
    color: '#333',
  },
  inputUnit: {
    fontSize: 14,
    color: '#666',
    width: 50,
  },
  currencyBadge: {
    backgroundColor: '#E8F2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  currencyText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  accountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  logoutButton: {
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#FF3B30',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonIcon: {
    marginRight: 4,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
}); 