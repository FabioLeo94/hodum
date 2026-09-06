import styles from "./avatarComponent.module.css";

interface Prop {
  displayName: string;
  size?: "sm" | "md" | "lg";
}

// Decorativo (aria-hidden): in tutti i punti in cui viene usato il
// displayName è già presente accanto come testo (o come aria-label del
// bottone che lo contiene, vedi topbarComponent), quindi non serve un
// secondo annuncio per lo screen reader.
function AvatarComponent({ displayName, size = "md" }: Prop) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {initial}
    </span>
  );
}

export default AvatarComponent;
