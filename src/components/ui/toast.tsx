import { Toaster as SonnerToaster, type ToasterProps, toast } from "sonner"

export { toast }

export function Toaster(props: ToasterProps) {
  return <SonnerToaster richColors {...props} />
}
