import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';

const GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const TRAVEL_STYLES = ['Backpacker', 'Luxury', 'Solo', 'Family', 'Weekend Trips'];
const USER_TYPES = [
  { value: 'traveler', label: 'Traveler' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'both', label: 'Both' },
];

type PickedImage = { uri: string; base64: string };

export default function EditProfile() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [userType, setUserType] = useState<string | null>(profile?.user_type || null);
  const [genres, setGenres] = useState<string[]>(profile?.photography_genres || []);
  const [travelStyle, setTravelStyle] = useState<string | null>(profile?.travel_style || null);
  const [homeCity, setHomeCity] = useState(profile?.home_city || '');
  const [avatarImage, setAvatarImage] = useState<PickedImage | null>(null);
  const [bannerImage, setBannerImage] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleGenre(g: string) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function pickImage(target: 'avatar' | 'banner') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change this.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6, base64: true, mediaTypes: ['images'],
      allowsEditing: true, aspect: target === 'avatar' ? [1, 1] : [16, 7],
    });
    if (!result.canceled && result.assets[0].base64) {
      const asset = { uri: result.assets[0].uri, base64: result.assets[0].base64 };
      if (target === 'avatar') setAvatarImage(asset); else setBannerImage(asset);
    }
  }

  async function uploadProfileMedia(base64: string, fileName: string) {
    const { error } = await supabase.storage.from('profile-media').upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return supabase.storage.from('profile-media').getPublicUrl(fileName).data.publicUrl;
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      let bannerUrl = profile?.banner_url ?? null;
      if (avatarImage) avatarUrl = await uploadProfileMedia(avatarImage.base64, `${session.user.id}/avatar.jpg`);
      if (bannerImage) bannerUrl = await uploadProfileMedia(bannerImage.base64, `${session.user.id}/banner.jpg`);

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName || null,
          username: username || null,
          bio: bio || null,
          user_type: userType,
          photography_genres: genres,
          travel_style: travelStyle,
          home_city: homeCity || null,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
        })
        .eq('id', session.user.id);

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Username taken', 'That username is already in use — try another one.');
        } else {
          Alert.alert('Could not save', error.message);
        }
        return;
      }
      await refreshProfile();
      router.back();
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScrollView style={styles.root} contentContainerStyle={styles.container} enableOnAndroid extraScrollHeight={28} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Edit profile</Text>

      <Pressable onPress={() => pickImage('banner')} style={styles.bannerPicker}>
        {(bannerImage?.uri || profile?.banner_url) ? (
          <Image source={{ uri: bannerImage?.uri || profile?.banner_url || '' }} style={styles.bannerPreview} />
        ) : (
          <Text style={styles.bannerPlaceholder}>Add a banner photo</Text>
        )}
      </Pressable>

      <Pressable onPress={() => pickImage('avatar')} style={styles.avatarPicker}>
        {(avatarImage?.uri || profile?.avatar_url) ? (
          <Image source={{ uri: avatarImage?.uri || profile?.avatar_url || '' }} style={styles.avatarPreview} />
        ) : (
          <Text style={styles.avatarPlaceholderText}>Add photo</Text>
        )}
      </Pressable>

      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor={theme.color.muted} />

      <Text style={styles.label}>Username</Text>
      <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="e.g. kingcric" placeholderTextColor={theme.color.muted} />

      <Text style={styles.label}>Bio</Text>
      <TextInput style={[styles.input, styles.multiline]} value={bio} onChangeText={setBio} multiline placeholder="Tell people about yourself" placeholderTextColor={theme.color.muted} />

      <Text style={styles.label}>I am a...</Text>
      <View style={styles.row}>
        {USER_TYPES.map((t) => (
          <Pressable key={t.value} onPress={() => setUserType(t.value)} style={[styles.chip, userType === t.value && styles.chipSelected]}>
            <Text style={[styles.chipText, userType === t.value && styles.chipTextSelected]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Photography interests</Text>
      <View style={styles.row}>
        {GENRES.map((g) => (
          <Pressable key={g} onPress={() => toggleGenre(g)} style={[styles.chip, genres.includes(g) && styles.chipSelected]}>
            <Text style={[styles.chipText, genres.includes(g) && styles.chipTextSelected]}>{g}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Travel style</Text>
      <View style={styles.row}>
        {TRAVEL_STYLES.map((s) => (
          <Pressable key={s} onPress={() => setTravelStyle(s)} style={[styles.chip, travelStyle === s && styles.chipSelected]}>
            <Text style={[styles.chipText, travelStyle === s && styles.chipTextSelected]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Home city</Text>
      <TextInput style={styles.input} value={homeCity} onChangeText={setHomeCity} placeholderTextColor={theme.color.muted} />

      <Pressable style={styles.submit} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save changes</Text>}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  container: { padding: 24, paddingBottom: 60 },
  heading: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream, marginBottom: 20 },
  bannerPicker: { height: 110, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bannerPreview: { width: '100%', height: '100%' },
  bannerPlaceholder: { color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 13 },
  avatarPicker: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.color.surface, borderWidth: 3, borderColor: theme.color.dusk, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: -42, marginLeft: 20 },
  avatarPreview: { width: '100%', height: '100%' },
  avatarPlaceholderText: { color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 10, textAlign: 'center' },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  multiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});