"use client";

import { useState, useEffect, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordSchema, type ResetPasswordFormData } from "@/lib/validations";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

type PageState = "form" | "success" | "invalid";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [pageState, setPageState] = useState<PageState>("form");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    // If no token in URL, show invalid state immediately
    if (!token) {
      setPageState("invalid");
    }
  }, [token]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token || "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setServerError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          newPassword: data.newPassword,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (res.status === 400) {
          setPageState("invalid");
        } else {
          setServerError(json.message || "Something went wrong. Please try again.");
        }
        return;
      }

      setPageState("success");
      toast.success("Password reset successfully!");

      // Auto-redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    }
  };

  // ── Invalid / expired token state ──
  if (pageState === "invalid") {
    return (
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="space-y-4 text-center">
          <div className="relative flex justify-center h-60 overflow-hidden rounded-2xl">
            <Image
              className="absolute rounded-2xl"
              src="https://res.cloudinary.com/dny5ik5ov/image/upload/v1769785709/Screenshot_2026-01-30_at_9.08.15_PM_jtkqpa.png"
              alt="Vision2036 Logo"
              width={450}
              height={20}
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Link expired</CardTitle>
            <CardDescription>This reset link is invalid or has expired</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Password reset links expire after <span className="font-medium">15 minutes</span> and
              can only be used once. Please request a new link.
            </p>
          </div>

          <Link href="/forgot-password">
            <Button className="w-full">Request a new link</Button>
          </Link>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            This is a private system. Access is restricted to members only.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Success state ──
  if (pageState === "success") {
    return (
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="space-y-4 text-center">
          <div className="relative flex justify-center h-60 overflow-hidden rounded-2xl">
            <Image
              className="absolute rounded-2xl"
              src="https://res.cloudinary.com/dny5ik5ov/image/upload/v1769785709/Screenshot_2026-01-30_at_9.08.15_PM_jtkqpa.png"
              alt="Vision2036 Logo"
              width={450}
              height={20}
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Password reset!</CardTitle>
            <CardDescription>Your password has been updated successfully</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              You can now sign in with your new password. Redirecting you to the login page…
            </p>
          </div>

          <Link href="/login">
            <Button className="w-full">Go to sign in</Button>
          </Link>

          <p className="text-center text-xs text-muted-foreground">
            This is a private system. Access is restricted to members only.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Form state ──
  return (
    <Card className="w-full max-w-md border-border/50">
      <CardHeader className="space-y-4 text-center">
        <div className="relative flex justify-center h-60 overflow-hidden rounded-2xl">
          <Image
            className="absolute rounded-2xl"
            src="https://res.cloudinary.com/dny5ik5ov/image/upload/v1769785709/Screenshot_2026-01-30_at_9.08.15_PM_jtkqpa.png"
            alt="Vision2036 Logo"
            width={450}
            height={20}
          />
        </div>
        <div>
          <CardTitle className="text-2xl font-semibold">Set new password</CardTitle>
          <CardDescription>Choose a strong password for your account</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Hidden token field for schema validation context */}
          <input type="hidden" {...register("token")} value={token || ""} />

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register("newPassword")}
                className={`pr-10 ${errors.newPassword ? "border-destructive" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-sm text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register("confirmPassword")}
                className={`pr-10 ${errors.confirmPassword ? "border-destructive" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting password...
              </>
            ) : (
              "Reset password"
            )}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          This is a private system. Access is restricted to members only.
        </p>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {/* useSearchParams requires Suspense boundary in Next.js App Router */}
        <Suspense
          fallback={
            <Card className="w-full max-w-md border-border/50">
              <CardContent className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </CardContent>
            </Card>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Vision2036. All rights reserved.
      </footer>
    </div>
  );
}
