import { useState, useCallback } from 'react';
import { View, Text, Image, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Avatar } from '@/components/Avatar';
import { ActionSheet } from '@/components/ActionSheet';

const GROUP_MEDIA_BUCKET = 'group-media';

type Member = { user_id: string; role: 'member' | 'admin'; username: string | null; full_name: string | null; avatar_url: string | null };
type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myUserId = session?.user.id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'member' | 'admin' | null>(null);
  const [actionFor, setActionFor] = useState<Member | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: infoData }, { data: memberRows }] = await Promise.all([
      supabase.rpc('get_conversation_info', { p_conversation_id: id }).maybeSingle(),
      supabase.from('conversation_members').select('user_id, role, profiles:user_id(username, full_name, avatar_url)').eq('conversation_id', id),
    ]);
    const info = infoData as { name: string | null; description: string | null; avatar_url: string | null; member_count: number; my_role: 'member' | 'admin' | null } | null;
    if (info) {
      setName(info.name || 'Group');
      setDescription(info.description || '');
      setAvatarUrl(info.avatar_url);
      setMemberCount(info.member_count);
      setMyRole(info.my_role);
    }
    if (memberRows) {
      const rows = (memberRows as unknown as { user_id: string; role: 'member' | 'admin'; profiles: Person | null }[])
        .map((m) => ({ user_id: m.user_id, role: m.role, username: m.profiles?.username ?? null, full_name: m.profiles?.full_name ?? null, avatar_url: m.profiles?.avatar_url ?? null }))
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
      setMembers(rows);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const search = useCallback(async (q: string) => {
    if (!session || q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const existingIds = new Set(members.map((m) => m.user_id));
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', session.user.id)
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(20);
    setResults(((data as Person[]) ?? []).filter((p) => !existingIds.has(p.id)));
    setSearching(false);
  }, [session, members]);

  async function addMember(personId: string) {
    const { error } = await supabase.rpc('add_group_members', { p_conversation_id: id, p_member_ids: [personId] });
    if (error) { Alert.alert('Could not add member', error.message); return; }
    setQuery('');
    setResults([]);
    setAddingOpen(false);
    load();
  }

  async function removeMember(member: Member) {
    Alert.alert(`Remove ${member.username || member.full_name || 'this person'}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('remove_group_member', { p_conversation_id: id, p_user_id: member.user_id });
        if (error) { Alert.alert('Could not remove member', error.message); return; }
        load();
      } },
    ]);
  }

  async function toggleAdmin(member: Member) {
    const makeAdmin = member.role !== 'admin';
    const { error } = await supabase.rpc('set_group_admin', { p_conversation_id: id, p_user_id: member.user_id, p_is_admin: makeAdmin });
    if (error) { Alert.alert('Could not update role', error.message); return; }
    load();
  }

  function handleLeave() {
    Alert.alert('Leave this group?', 'You can only rejoin if an admin adds you back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('leave_group_conversation', { p_conversation_id: id });
        if (error) { Alert.alert('Could not leave', error.message); return; }
        router.replace('/(tabs)/chat');
      } },
    ]);
  }

  function openEdit() {
    setEditName(name);
    setEditDescription(description);
    setEditing(true);
  }

  async function saveEdit() {
    if (editName.trim().length === 0) {
      Alert.alert('Name required', 'Give the group a name.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_group_info', { p_conversation_id: id, p_name: editName.trim(), p_description: editDescription.trim() || null });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    setEditing(false);
    load();
  }

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set a group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true, mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingPhoto(true);
    const fileName = `${id}/avatar_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(GROUP_MEDIA_BUCKET).upload(fileName, decode(result.assets[0].base64), { contentType: 'image/jpeg' });
    if (uploadError) {
      setUploadingPhoto(false);
      Alert.alert('Could not upload photo', uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from(GROUP_MEDIA_BUCKET).getPublicUrl(fileName);
    const { error: rpcError } = await supabase.rpc('set_group_avatar', { p_conversation_id: id, p_avatar_url: publicUrlData.publicUrl });
    setUploadingPhoto(false);
    if (rpcError) { Alert.alert('Could not save photo', rpcError.message); return; }
    setAvatarUrl(publicUrlData.publicUrl);
  }

  const isAdmin = myRole === 'admin';

  if (loading) {
    return (
      <ScreenBackground>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        {isAdmin && !editing && (
          <Pressable onPress={openEdit} style={styles.editBtn}>
            <Ionicons name="pencil-outline" size={17} color={theme.color.gold} />
          </Pressable>
        )}

        <Pressable onPress={isAdmin ? changePhoto : undefined} style={styles.groupAvatar}>
          {uploadingPhoto ? (
            <ActivityIndicator color={theme.color.dusk} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.groupAvatarImage} />
          ) : (
            <Ionicons name="people" size={30} color={theme.color.dusk} />
          )}
          {isAdmin && !uploadingPhoto && (
            <View style={styles.cameraBadge}><Ionicons name="camera" size={12} color={theme.color.dusk} /></View>
          )}
        </Pressable>

        {editing ? (
          <View style={styles.editForm}>
            <TextInput style={styles.editInput} placeholder="Group name" placeholderTextColor={theme.color.muted} value={editName} onChangeText={setEditName} />
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              placeholder="Description (optional)"
              placeholderTextColor={theme.color.muted}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditing(false)} style={styles.editCancelBtn}><Text style={styles.editCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={saveEdit} disabled={saving} style={styles.editSaveBtn}>
                {saving ? <ActivityIndicator color={theme.color.dusk} size="small" /> : <Text style={styles.editSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.subtitle}>{memberCount} members</Text>
            {!!description && <Text style={styles.description}>{description}</Text>}
          </>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            {isAdmin && (
              <Pressable onPress={() => setAddingOpen((v) => !v)} style={styles.addRow}>
                <View style={styles.addIconWrap}><Ionicons name="person-add-outline" size={18} color={theme.color.gold} /></View>
                <Text style={styles.addText}>Add members</Text>
              </Pressable>
            )}
            {addingOpen && (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Search people to add"
                  placeholderTextColor={theme.color.muted}
                  value={query}
                  onChangeText={(q) => { setQuery(q); search(q); }}
                  autoFocus
                />
                {searching && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 10 }} />}
                {results.map((p) => {
                  const label = p.username || p.full_name || 'traveler';
                  return (
                    <Pressable key={p.id} style={styles.memberRow} onPress={() => addMember(p.id)}>
                      <Avatar uri={p.avatar_url} label={label} size={40} />
                      <Text style={styles.memberName}>{label}</Text>
                      <Ionicons name="add-circle-outline" size={20} color={theme.color.gold} />
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.sectionLabel}>Members</Text>
          </View>
        }
        renderItem={({ item }) => {
          const label = item.username || item.full_name || 'traveler';
          return (
            <Pressable
              style={styles.memberRow}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } })}
              onLongPress={() => { if (isAdmin && item.user_id !== myUserId) setActionFor(item); }}>
              <Avatar uri={item.avatar_url} label={label} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{label}</Text>
              </View>
              {item.role === 'admin' && (
                <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
              )}
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Pressable onPress={handleLeave} style={styles.leaveBtn}>
            <Ionicons name="exit-outline" size={16} color={theme.color.ember} />
            <Text style={styles.leaveBtnText}>Leave group</Text>
          </Pressable>
        }
      />

      <ActionSheet
        visible={!!actionFor}
        onClose={() => setActionFor(null)}
        title={actionFor?.username || actionFor?.full_name || 'traveler'}
        options={actionFor ? [
          { key: 'admin', label: actionFor.role === 'admin' ? 'Remove as admin' : 'Make admin', icon: 'shield-outline', onPress: () => toggleAdmin(actionFor) },
          { key: 'remove', label: 'Remove from group', icon: 'person-remove-outline', destructive: true, onPress: () => removeMember(actionFor) },
        ] : []}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { position: 'absolute', left: 14, top: 0, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  editBtn: { position: 'absolute', right: 14, top: 0, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  groupAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', marginTop: 20, overflow: 'hidden' },
  groupAvatarImage: { width: '100%', height: '100%' },
  cameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: theme.color.cream, borderWidth: 2, borderColor: theme.color.dusk, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream, marginTop: 12 },
  subtitle: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, marginTop: 3 },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.cream, marginTop: 10, textAlign: 'center', lineHeight: 18 },
  editForm: { width: '100%', marginTop: 14, gap: 8 },
  editInput: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 10, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 13.5 },
  editInputMultiline: { height: 70, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editCancelBtn: { flex: 1, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 10, alignItems: 'center' },
  editCancelText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted },
  editSaveBtn: { flex: 1, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 10, alignItems: 'center' },
  editSaveText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.dusk },
  sectionLabel: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.muted, marginTop: 16, marginBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  addIconWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.gold },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 10, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 13.5 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  memberName: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.cream, flex: 1 },
  adminBadge: { backgroundColor: 'rgba(232,166,76,0.15)', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9 },
  adminBadgeText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, paddingVertical: 12, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md },
  leaveBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.ember },
});
