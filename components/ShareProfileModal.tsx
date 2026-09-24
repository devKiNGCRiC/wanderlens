/**
 * ShareProfileModal, a centred card showing a QR code for the user's profile.
 *
 * Purpose: opened from the own Profile tab (app/(tabs)/profile.tsx) so
 * another person can scan the code, or receive a link, and land on this
 * user's public profile.
 *
 * How it works:
 * - Builds a deep link `wanderlens://user/<id>`; "wanderlens" is the URL
 *   scheme set in app.json, and expo-router maps `/user/<id>` to
 *   app/user/[id].tsx when the app is opened from that link.
 * - The QR image is not generated on the device: it is fetched from the
 *   public api.qrserver.com service with the deep link as a URL parameter,
 *   so the user id is sent to that third party and the QR needs network.
 * - "Share link instead" opens the OS share sheet (React Native's `Share`)
 *   with the same link as text.
 * - Tapping the backdrop closes the modal.
 */
import { Modal, View, Text, Image, Pressable, StyleSheet, Share } from 'react-native';
import { theme } from '@/constants/theme';

/**
 * QR/share modal.
 * @param userId - the profile's user id, embedded in the deep link.
 * @param name - display name used in the hint and the share message.
 */
export function ShareProfileModal({ visible, onClose, userId, name }: { visible: boolean; onClose: () => void; userId: string; name: string }) {
  // Link the app itself can open, plus a URL that renders it as a QR image.
  const deepLink = `wanderlens://user/${userId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(deepLink)}`;

  /** Opens the native share sheet with the profile link. The result isn't awaited or checked. */
  function handleShare() {
    Share.share({ message: `Connect with ${name} on Wanderlens: ${deepLink}` });
  }

  // The card is a plain View (not a Pressable), so taps on it are not
  // intercepted and bubble up to the backdrop's onClose as well.
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.heading}>Share profile</Text>
          {/* Remote QR image from api.qrserver.com */}
          <Image source={{ uri: qrUrl }} style={styles.qr} />
          <Text style={styles.hint}>Scan to open {name}&apos;s profile in Wanderlens</Text>
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

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
// The QR image's white background is a '#fff' literal rather than a token.
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