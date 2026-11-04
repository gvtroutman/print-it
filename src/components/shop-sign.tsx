import styles from "./shop-sign.module.css";

/** A shop-door sign, suspended from a pin by a continuous length of twine. */
export function ShopSign({ closed = false }: { closed?: boolean }) {
  return (
    <div className={styles.sign}>
      <div className={styles.hanging}>
        {/* The transparent photograph keeps the loose jute fibers intact.
            Its upper length sits behind the board; the knots sit in front. */}
        <span className={styles.twine} aria-hidden="true" />
        <div className={`${styles.board} ${closed ? styles.closed : styles.open}`}>
          <span className={`${styles.eyelet} ${styles.left}`} aria-hidden="true" />
          <span className={`${styles.eyelet} ${styles.right}`} aria-hidden="true" />
          <p className={styles.status}>{closed ? "Closed" : "Open"}</p>
          <p className={styles.caption}>{closed ? "Printer repairs" : "Come on in"}</p>
        </div>
        <span className={`${styles.knots} ${styles.knotLeft}`} aria-hidden="true" />
        <span className={`${styles.knots} ${styles.knotRight}`} aria-hidden="true" />
      </div>
      <span className={styles.pin} aria-hidden="true" />
    </div>
  );
}
