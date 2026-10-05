import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { hasStoredSidebarProject } from "@/hooks/sidebar-thread-projects";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  getCurrentProjectRemoveReadiness,
  removeProjectFromHosts,
} from "@/projects/project-remove";

export function useRemoveSidebarProject(
  project: SidebarProjectEntry,
  displayName: string
) {
  const toast = useToast();
  const { t } = useTranslation();
  const [isRemovingProject, setIsRemovingProject] = useState(false);

  const handleRemoveProject = useCallback(() => {
    if (isRemovingProject || !hasStoredSidebarProject(project)) return;

    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.project.confirmations.removeTitle"),
        message: t("sidebar.project.confirmations.removeMessage", {
          projectName: displayName,
        }),
        confirmLabel: t("sidebar.project.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.project.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) return;

      setIsRemovingProject(true);
      const readiness = getCurrentProjectRemoveReadiness({
        hosts: project.hosts,
      });
      if (readiness.kind === "needs_host_update") {
        toast.error(t("sidebar.project.toasts.updateHostToRemove"));
        setIsRemovingProject(false);
        return;
      }

      void removeProjectFromHosts({
        targets: readiness.targets,
        getClient: (serverId) => getHostRuntimeStore().getClient(serverId),
      })
        .then((outcome) => {
          if (outcome.kind === "host_disconnected") {
            toast.error(t("sidebar.project.toasts.hostDisconnected"));
            return null;
          }
          if (outcome.kind === "failed")
            toast.error(t("sidebar.project.toasts.removeFailed"));
          return null;
        })
        .catch((error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : t("sidebar.project.toasts.removeFailed")
          );
        })
        .finally(() => setIsRemovingProject(false));
    })();
  }, [isRemovingProject, displayName, t, toast, project]);

  return { handleRemoveProject, isRemovingProject };
}
