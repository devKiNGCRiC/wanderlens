import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export function SplashLoading() {
    return (
        <View style={styles.container}>
        <Text style={styles.logo}>Wanderlens</Text>
        <ActivityIndicator size="small" color="#1F3864" style={{ marginTop: 16 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: '#fff' 
    },
    logo: { 
        fontSize: 28, 
        fontWeight: '700', 
        color: '#1F3864', 
        letterSpacing: 0.5 
    },
});