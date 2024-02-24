import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/router";

function ConnectWallet() {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const router = useRouter();

  return (
    <button
      className="mx-5 px-2 py-2 md:px-4 md:py-2 lg:px-5 lg:py-3 rounded-md text-sm lg:text-base font-bold text-[#5075E2] bg-[#F8F8B4] font-roboto"
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
    </button>
  );
}

export default ConnectWallet;
