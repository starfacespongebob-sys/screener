using System.Security.Cryptography;

namespace RelayService {
    public static class Encryption {
        public static byte[] Encrypt(byte[] data, byte[] key, byte[] iv) {
            using var aes = Aes.Create();
            aes.Key = key;
            aes.IV = iv;
            return aes.EncryptCbc(data, iv);
        }
    }
}
