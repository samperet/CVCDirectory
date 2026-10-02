import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LayoutGrid, LogOut, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { Circle, CircleApplication, CircleSeat, JoinPolicy } from "@/lib/circles/types";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import {
  CircleModules,
  ModuleEditor,
  ModuleToggle,
  type ModuleViews,
} from "@/components/circles/circle-modules";
import {
  AddModuleDialog,
  InformationSettings,
  MODULE_ICONS,
  TasksSettings,
  describeFilter,
  describeTasks,
} from "@/components/circles/module-dialogs";
import { type CircleModule, moduleTitle, modulesFor } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { useToast } from "@/components/ui/use-toast";
import { BOARD_ID, isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { MembersModule, ROLES } from "@/components/circles/members-module";

/** Circle mutations all refresh the shared directory query. */
export function useCircleMutation<T>(
  request: (input: T) => Promise<unknown>,
  errorTitle: string,
  onDone?: () => void
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      queryClient.invalidateQueries({ queryKey: ["circle-applications"] });
      onDone?.();
    },
    onError: (err: Error) =>
      toast({ title: errorTitle, description: err.message, variant: "destructive" }),
  });
}
