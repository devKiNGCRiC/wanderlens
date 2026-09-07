import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { CountryPicker } from '@/components/CountryPicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBackground } from '@/components/ScreenBackground';

const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
const TRAVEL_STYLES = ['Backpacker', 'Luxury', 'Solo', 'Family', 'Weekend Trips'];
const CORE_PLACES = ['Mountains', 'Beaches', 'City', 'Hills'];
const MORE_PLACES = ['Desert', 'Forest', 'Islands', 'Countryside', 'Historical Sites', 'Wildlife Safari'];
const USER_TYPES = [
  { value: 'traveler', label: 'Traveler' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'both', label: 'Both' },
];

type PickedImage = { uri: string; base64: string };

export default function EditProfile() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [userType, setUserType] = useState<string | null>(profile?.user_type || null);
  const [genres, setGenres] = useState<string[]>(profile?.photography_genres || []);
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [customGenre, setCustomGenre] = useState('');
  const [placeInterests, setPlaceInterests] = useState<string[]>(profile?.place_interests || []);
  const [showMorePlaces, setShowMorePlaces] = useState(false);
  const [customPlace, setCustomPlace] = useState('');
  const [travelStyle, setTravelStyle] = useState<string | null>(profile?.travel_style || null);
  const [homeCity, setHomeCity] = useState(profile?.home_city || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [avatarImage, setAvatarImage] = useState<PickedImage | null>(null);
  const [bannerImage, setBannerImage] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);


  function toggleGenre(g: string) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }
  function togglePlace(p: string) {
    setPlaceInterests((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  function addCustomGenre() {
    if (customGenre.trim() && !genres.includes(customGenre.trim())) {
      setGenres((prev) => [...prev, customGenre.trim()]);
      setCustomGenre('');
    }
  }
  function addCustomPlace() {
    if (customPlace.trim() && !placeInterests.includes(customPlace.trim())) {
      setPlaceInterests((prev) => [...prev, customPlace.trim()]);
      setCustomPlace('');
    }
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
          place_interests: placeInterests,
          travel_style: travelStyle,
          home_city: homeCity || null,
          country: country || null,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
        })
        .eq('id', session.user.id);

      if (error) {
        if (error.code === '23505') Alert.alert('Username taken', 'That username is already in use — try another one.');
        else Alert.alert('Could not save', error.message);
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
    <ScreenBackground>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Edit profile</Text>
        <View style={{ width: 36 }} />
        </View>
        <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={28}
        >

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

            <Text style={styles.label}>Country</Text>
            <Pressable style={styles.input} onPress={() => setCountryPickerVisible(true)}>
                <Text style={{ color: country ? theme.color.cream : theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 15 }}>
                {country || 'Select your country'}
                </Text>
            </Pressable>

            <Text style={styles.label}>Home city</Text>
            <TextInput style={styles.input} value={homeCity} onChangeText={setHomeCity} placeholderTextColor={theme.color.muted} />

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
                {[...CORE_GENRES, ...(showMoreGenres ? MORE_GENRES : [])].map((g) => (
                <Pressable key={g} onPress={() => toggleGenre(g)} style={[styles.chip, genres.includes(g) && styles.chipSelected]}>
                    <Text style={[styles.chipText, genres.includes(g) && styles.chipTextSelected]}>{g}</Text>
                </Pressable>
                ))}
                {!showMoreGenres && (
                <Pressable onPress={() => setShowMoreGenres(true)} style={styles.chip}><Text style={styles.chipText}>More +</Text></Pressable>
                )}
                {genres.filter((g) => ![...CORE_GENRES, ...MORE_GENRES].includes(g)).map((g) => (
                <Pressable key={g} onPress={() => toggleGenre(g)} style={[styles.chip, styles.chipSelected]}>
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{g}</Text>
                </Pressable>
                ))}
            </View>
            <View style={styles.customRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own genre" placeholderTextColor={theme.color.muted} value={customGenre} onChangeText={setCustomGenre} onSubmitEditing={addCustomGenre} />
                <Pressable onPress={addCustomGenre} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
            </View>

            <Text style={styles.label}>Places you love</Text>
            <View style={styles.row}>
                {[...CORE_PLACES, ...(showMorePlaces ? MORE_PLACES : [])].map((p) => (
                <Pressable key={p} onPress={() => togglePlace(p)} style={[styles.chip, placeInterests.includes(p) && styles.chipSelected]}>
                    <Text style={[styles.chipText, placeInterests.includes(p) && styles.chipTextSelected]}>{p}</Text>
                </Pressable>
                ))}
                {!showMorePlaces && (
                <Pressable onPress={() => setShowMorePlaces(true)} style={styles.chip}><Text style={styles.chipText}>More +</Text></Pressable>
                )}
                {placeInterests.filter((p) => ![...CORE_PLACES, ...MORE_PLACES].includes(p)).map((p) => (
                <Pressable key={p} onPress={() => togglePlace(p)} style={[styles.chip, styles.chipSelected]}>
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{p}</Text>
                </Pressable>
                ))}
            </View>
            <View style={styles.customRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own place type" placeholderTextColor={theme.color.muted} value={customPlace} onChangeText={setCustomPlace} onSubmitEditing={addCustomPlace} />
                <Pressable onPress={addCustomPlace} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
            </View>

            <Text style={styles.label}>Travel style</Text>
            <View style={styles.row}>
                {TRAVEL_STYLES.map((s) => (
                <Pressable key={s} onPress={() => setTravelStyle(s)} style={[styles.chip, travelStyle === s && styles.chipSelected]}>
                    <Text style={[styles.chipText, travelStyle === s && styles.chipTextSelected]}>{s}</Text>
                </Pressable>
                ))}
            </View>

            <Pressable style={styles.submit} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save changes</Text>}
            </Pressable>

            <CountryPicker visible={countryPickerVisible} onClose={() => setCountryPickerVisible(false)} onSelect={setCountry} />
        </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
    root: { flex: 1, },
    container: { padding: 24, paddingBottom: 60 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
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
    customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    addBtn: { backgroundColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    addBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 13 },
    submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
    submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});