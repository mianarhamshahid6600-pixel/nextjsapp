"use client"

import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context" // Import useAuth
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { initialAppSettings } from "@/lib/data" // Import initialAppSettings for fallback

export function Toaster() {
  const { toasts } = useToast()
  const { appSettings } = useAuth() // Get app settings

  const defaultDuration = appSettings?.toastDuration ?? initialAppSettings.toastDuration;

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // Override duration if not explicitly set in the toast call
        const duration = props.duration === undefined ? defaultDuration : props.duration;
        
        return (
          <Toast key={id} {...props} duration={duration}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
