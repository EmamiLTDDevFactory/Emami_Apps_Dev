import { StyleSheet } from 'react-native'
import React, { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import CustomTabs from '@/components/CustomTabs';
import { useAuth } from '@/contexts/AuthContext';

// No login screen exists anymore to send someone back to if they land here with no resolved
// role — a direct link or a page refresh inside (tabs) would otherwise silently render the
// no-data Vendor view (every screen here already tolerates user being null via optional
// chaining). Send them back through the role-resolving entry screen instead.
const _layout = () => {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace('/apps/mouldhealthcheck');
  }, [user]);

  return (
    <Tabs tabBar={(props) => <CustomTabs {...props} />} screenOptions={{headerShown: false}}>
    </Tabs>
  )
}

export default _layout

const styles = StyleSheet.create({})
