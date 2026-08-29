import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenScaffold from '../components/ScreenScaffold';
import { RECENT, appById } from '../data/mockData';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { useAuth } from '../context/AuthContext';
import { logEvent } from '../lib/authApi';
import { colors, fonts, radii, appColor } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export default function RecentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unlockedAppIds = useUnlockedAppIds();
  const { userEmail } = useAuth();
  const [query, setQuery] = useState('');

  const openApp = (appId: string) => {
    if (!unlockedAppIds.has(appId)) return; // was missing — this page could open apps a Viewer isn't granted
    if (userEmail) logEvent(userEmail, 'APP_OPEN', appId);
    // Web: open the app in its own tab instead of navigating this one away. Native has no tab
    // concept, so it keeps going through AppDetail's in-app WebView.
    const url = appById(appId)?.url;
    if (Platform.OS === 'web' && url) {
      Linking.openURL(url);
      return;
    }
    navigation.navigate('AppDetail', { appId });
  };

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Recently Used</Text>
        <View style={styles.list}>
          {RECENT.map((r, i) => {
            const app = appById(r.id);
            if (!app) return null;
            const Icon = app.icon;
            const accent = appColor(app.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => openApp(app.id)}
                style={[styles.row, i < RECENT.length - 1 && styles.rowBorder]}
              >
                <View style={[styles.icon, { backgroundColor: `${accent}1f` }]}>
                  <Icon size={16} color={accent} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.name}>{app.name}</Text>
                  <Text style={styles.when}>{r.when}</Text>
                </View>
                <ChevronRight size={15} color={colors.inkSoft} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 16,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: { flex: 1 },
  name: {
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  when: {
    fontSize: 11.5,
    color: colors.inkSoft,
    fontFamily: fonts.sansRegular,
    marginTop: 2,
  },
});
