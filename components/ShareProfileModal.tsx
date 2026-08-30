import { Modal, View, Text, Image, Pressable, StyleSheet, Share } from 'react-native';
import { theme } from '@/constants/theme';

export function ShareProfileModal({ visible, onClose, userId, name }: { visible: boolean; onClose: () => void; userId: string; name: string }) {
  const deepLink = `wanderlens://user/${userId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(deepLink)}`;

  function handleShare() {
    Share.share({ message: `Connect with ${name} on Wanderlens: ${deepLink}` });
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.heading}>Share profile</Text>
          <Image source={{ uri: qrUrl }} style={styles.qr} />
          <Text style={styles.hint}>Scan to open {name}'s profile in Wanderlens</Text>
          <Pressable onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>Share link instead</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: theme.color.surface, borderRadius: theme.radius.md, padding: 24, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: theme.color.surface2 },
  heading: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.cream, marginBottom: 16 },
  qr: { width: 180, height: 180, borderRadius: 8, backgroundColor: '#fff' },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 14, textAlign: 'center' },
  shareBtn: { marginTop: 18, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  shareBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.dusk },
  closeBtn: { marginTop: 12 },
  closeText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
});