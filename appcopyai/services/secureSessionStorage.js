const SECURE_SESSION_KEY = "skillomate.secure.session.v1";
const LEGACY_SESSION_KEY = "user";

function createSecureSessionStorage({ secureStore, legacyStorage }) {
  if (!secureStore || !legacyStorage) throw new Error("Secure and legacy storage are required");

  return {
    async getItem(key) {
      if (key !== LEGACY_SESSION_KEY) return legacyStorage.getItem(key);
      const secured = await secureStore.getItemAsync(SECURE_SESSION_KEY);
      if (secured) return secured;

      const legacy = await legacyStorage.getItem(LEGACY_SESSION_KEY);
      if (!legacy) return null;
      await secureStore.setItemAsync(SECURE_SESSION_KEY, legacy, {
        keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      const verified = await secureStore.getItemAsync(SECURE_SESSION_KEY);
      if (verified !== legacy) throw new Error("Secure session migration could not be verified");
      await legacyStorage.removeItem(LEGACY_SESSION_KEY);
      return verified;
    },

    async setItem(key, value) {
      if (key !== LEGACY_SESSION_KEY) return legacyStorage.setItem(key, value);
      await secureStore.setItemAsync(SECURE_SESSION_KEY, value, {
        keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      // Never retain a second plaintext credential copy after a secure write.
      await legacyStorage.removeItem(LEGACY_SESSION_KEY);
    },

    async removeItem(key) {
      if (key !== LEGACY_SESSION_KEY) return legacyStorage.removeItem(key);
      await Promise.all([
        secureStore.deleteItemAsync(SECURE_SESSION_KEY),
        legacyStorage.removeItem(LEGACY_SESSION_KEY),
      ]);
    },
  };
}

module.exports = { LEGACY_SESSION_KEY, SECURE_SESSION_KEY, createSecureSessionStorage };
