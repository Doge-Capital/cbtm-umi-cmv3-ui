import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/router";
import { Box } from "@chakra-ui/react";

function ConnectWallet() {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const router = useRouter();

  return (
    <Box
      cursor={"pointer"}
      p={3}
      borderRadius={"4px"}
      bg={"#F8F8B4"}
      color={"#5075E2"}
      fontSize={"1.2rem"}
      fontWeight={"black"}
      letterSpacing={"tighter"}
      onClick={async (e) => {
        if (wallet && wallet.publicKey) {
          try {
            e.preventDefault();
            await wallet.disconnect();
            router.push("/");
          } catch (e) {
            console.log(e);
          }
        }
        if (!wallet.connected) {
          walletModal.setVisible(true);
        }
      }}
    >
      {wallet.publicKey
        ? wallet.publicKey.toString().slice(0, 5) +
          "..." +
          wallet.publicKey.toString().slice(-5)
        : "Connect Wallet"}
    </Box>
  );
}

export default ConnectWallet;
