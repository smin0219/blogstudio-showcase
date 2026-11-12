"use client";

import { Button, HStack, Text } from "@chakra-ui/react";
import * as React from "react";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
};

const INITIAL_STATE: ConfirmState = {
  open: false,
  title: "",
  description: "",
  confirmText: "확인",
  cancelText: "닫기",
  isDanger: false,
};

export function useStyledConfirmDialog() {
  const resolverRef = React.useRef<((ok: boolean) => void) | null>(null);
  const [state, setState] = React.useState<ConfirmState>(INITIAL_STATE);

  const closeWith = React.useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description ?? "",
        confirmText: options.confirmText ?? "확인",
        cancelText: options.cancelText ?? "닫기",
        isDanger: options.isDanger ?? false,
      });
    });
  }, []);

  const dialog = (
    <DialogRoot
      open={state.open}
      onOpenChange={({ open }) => {
        if (!open) closeWith(false);
      }}
      placement="center"
      modal={true}
    >
      <DialogContent maxW={{ base: "calc(100dvw - 2rem)", md: "420px" }} p={7}>
        <DialogHeader pb={1} pt={2} px={0} pl={4}>
          <DialogTitle>{state.title}</DialogTitle>
        </DialogHeader>
        {state.description ? (
          <DialogBody pt={2} pb={10} px={0} pl={4}>
            <Text lineHeight="tall" whiteSpace="pre-line">
              {state.description}
            </Text>
          </DialogBody>
        ) : null}
        <DialogFooter justifyContent="flex-end" pb={0} pt={0} px={0} pl={4}>
          <HStack gap={2}>
            <Button variant="outline" onClick={() => closeWith(false)}>
              {state.cancelText}
            </Button>
            <Button
              bg={state.isDanger ? "red.500" : "bs.brand.green"}
              color="white"
              _hover={{
                bg: state.isDanger ? "red.600" : "bs.brand.heroGreenLight",
              }}
              onClick={() => closeWith(true)}
            >
              {state.confirmText}
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );

  return { confirm, confirmDialog: dialog };
}
