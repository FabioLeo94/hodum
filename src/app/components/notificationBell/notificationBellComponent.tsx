import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Bell, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatDateTime } from "../../../shared/utils/formatDate";
import { formatDateOnly } from "../../../shared/utils/taskDueDate";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notification/notificationService";
import type { Notification } from "../../services/notification/notificationService";
import { subscribeToNotifications } from "../../services/realtime/socketService";
import styles from "./notificationBellComponent.module.css";

const MAX_BADGE_COUNT = 99;

// dueDate è "YYYY-MM-DD" (mai un timestamp): il confronto lessicografico con
// formatDateOnly(oggi) evita ogni problema di fuso orario, stesso principio
// di parseDateOnly/isTaskOverdue in taskDueDate.ts, senza doverne dipendere
// (quella funzione vuole un Task intero, qui basta la stringa).
function describeNotification(notification: Notification, t: TFunction): string {
  const actor = notification.actorUsername ?? t("components.notificationBell.actorFallback");
  const taskTitle = notification.taskTitle ?? t("components.notificationBell.taskTitleFallback");
  switch (notification.type) {
    case "task_comment":
      return t("components.notificationBell.describe.taskComment", { actor, taskTitle });
    case "task_created":
      return t("components.notificationBell.describe.taskCreated", { actor, taskTitle });
    case "task_due": {
      const isOverdue =
        notification.dueDate !== null && notification.dueDate < formatDateOnly(new Date());
      const capitalizedTaskTitle =
        notification.taskTitle ?? t("components.notificationBell.taskTitleFallbackCapitalized");
      return t(
        isOverdue
          ? "components.notificationBell.describe.taskDueOverdue"
          : "components.notificationBell.describe.taskDueSoon",
        { taskTitle: capitalizedTaskTitle },
      );
    }
    case "project_assigned":
      return t("components.notificationBell.describe.projectAssigned", {
        projectName: notification.projectName ?? t("components.notificationBell.projectNameFallback"),
      });
    case "task_assigned":
      return t("components.notificationBell.describe.taskAssigned", { actor, taskTitle });
  }
}

// Stessa condizione usata in handleNotificationClick per decidere se navigare:
// qui serve solo a mostrare l'indicatore visivo (chevron) coerente con quel
// comportamento, senza duplicare la logica di navigazione.
function isNavigableNotification(notification: Notification): boolean {
  return notification.type === "task_assigned" || notification.type === "project_assigned";
}

// Campanella + dropdown nel topbar, montata su ogni pagina che include
// TopbarComponent: nessuno stato sopravvive alla navigazione, il mount
// successivo rifà la fetch (stesso patto già accettato per companyName/projects
// nello stesso file).
function NotificationBellComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // undefined = non ancora caricato: distingue "sto caricando" da "0
  // notifiche", stesso motivo di `projects` in topbarComponent. A differenza
  // del menu Progetti la fetch parte subito al mount (non alla prima
  // apertura): il badge deve riflettere unreadCount anche a pannello chiuso.
  const [items, setItems] = useState<Notification[] | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    listNotifications()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setUnreadCount(data.unreadCount);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : t("components.notificationBell.loadError"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Nessuna guardia "cancelled" qui: l'handler si limita ad aggiornare state
  // locale (non un side effect esterno), e il cleanup rimuove il listener
  // allo smontaggio prima che possa scattare ancora.
  useEffect(() => {
    return subscribeToNotifications({
      onCreated: (notification) => {
        setItems((prev) => [notification, ...(prev ?? [])]);
        setUnreadCount((prev) => prev + 1);
      },
    });
  }, []);

  // Stesso pattern di dismiss del menu Progetti in topbarComponent: il
  // pannello vive in un portal, quindi un click "dentro" va riconosciuto
  // anche lì, non solo dentro containerRef.
  useEffect(() => {
    if (!isOpen) return;

    firstFocusRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Stesso motivo di projectsPanelRef in topbarComponent: portal su
  // document.body per non farsi tagliare da un antenato con overflow non
  // "visible", riposizionato via rect del bottone perché vive fuori dal
  // flusso del suo trigger. Ancorato al bordo destro (non sinistro come il
  // menu Progetti): la campanella sta vicino al bordo destro della finestra,
  // un pannello ancorato a sinistra rischierebbe di uscire dal viewport.
  useLayoutEffect(() => {
    if (!isOpen) return;

    function reposition() {
      const button = bellButtonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) return;
      const rect = button.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.right = `${window.innerWidth - rect.right}px`;
    }

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [isOpen]);

  function handleMarkAllRead() {
    setItems((prev) => prev?.map((notification) => ({ ...notification, read: true })));
    setUnreadCount(0);
    markAllNotificationsRead().catch((err: unknown) => {
      console.error("Impossibile segnare tutte le notifiche come lette.", err);
    });
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      setItems((prev) =>
        prev?.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markNotificationRead(notification.id).catch((err: unknown) => {
        console.error("Impossibile segnare la notifica come letta.", err);
      });
    }
    setIsOpen(false);
    // Solo le notifiche di assegnazione portano a un link garantito valido:
    // task/progetto assegnati esistono ancora al momento della notifica. Gli
    // altri tipi (commento, creazione, scadenza) non navigano: potrebbero
    // riferirsi a un task nel frattempo eliminato, portando a un link rotto.
    if (notification.type === "task_assigned" && notification.projectId && notification.taskId) {
      navigate(`/dashboard/${notification.projectId}/task-list?openTask=${notification.taskId}`);
    } else if (notification.type === "project_assigned" && notification.projectId) {
      navigate(`/dashboard/${notification.projectId}/task-list`);
    }
  }

  const badgeLabel = unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(unreadCount);
  const showMarkAll = unreadCount > 0;

  return (
    <div className={styles.notificationArea} ref={containerRef}>
      <button
        ref={bellButtonRef}
        type="button"
        className={styles.bellButton}
        aria-label={
          unreadCount > 0
            ? t("components.notificationBell.bellLabelUnread", { count: unreadCount })
            : t("components.notificationBell.bellLabel")
        }
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.badge}>{badgeLabel}</span>}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={t("components.notificationBell.bellLabel")}
            className={styles.panel}
          >
            {showMarkAll && (
              <button
                ref={firstFocusRef}
                type="button"
                role="menuitem"
                className={styles.markAllButton}
                onClick={handleMarkAllRead}
              >
                {t("components.notificationBell.markAllRead")}
              </button>
            )}

            {error ? (
              <p className={styles.status} role="alert">
                {error}
              </p>
            ) : items === undefined ? (
              <p className={styles.status}>{t("components.notificationBell.loading")}</p>
            ) : items.length === 0 ? (
              <p className={styles.status}>{t("components.notificationBell.empty")}</p>
            ) : (
              items.map((notification, index) => {
                const navigable = isNavigableNotification(notification);
                return (
                  <button
                    key={notification.id}
                    ref={!showMarkAll && index === 0 ? firstFocusRef : undefined}
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    data-unread={!notification.read}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <span className={styles.itemBody}>
                      <span
                        className={styles.itemText}
                        title={describeNotification(notification, t)}
                      >
                        {describeNotification(notification, t)}
                      </span>
                      <span className={styles.itemTime}>
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </span>
                    {navigable && (
                      <>
                        <ChevronRight
                          className={styles.itemArrow}
                          size={16}
                          aria-hidden="true"
                        />
                        <span className={styles.srOnly}>
                          {t("components.notificationBell.openDetail")}
                        </span>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default NotificationBellComponent;
