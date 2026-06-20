"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { forgotPasswordSchema, type ForgotPasswordFormData } from "@/lib/validations";
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

export default function ForgotPasswordPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setServerError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setServerError(json.message || "Something went wrong. Please try again.");
        return;
      }

      setSubmittedEmail(data.email);
      setIsSubmitted(true);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50">
          <CardHeader className="space-y-4 text-center">
            {/* Logo */}
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
              <CardTitle className="text-2xl font-semibold">
                {isSubmitted ? "Check your email" : "Forgot password?"}
              </CardTitle>
              <CardDescription>
                {isSubmitted
                  ? `We've sent a reset link to ${submittedEmail}`
                  : "Enter your email and we'll send you a reset link"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {isSubmitted ? (
              /* ── Success state ── */
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    If <span className="font-medium text-foreground">{submittedEmail}</span> is
                    registered, a password reset link will arrive in your inbox within a minute.
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    The link expires in <span className="font-medium">15 minutes</span>.
                    Check your spam folder if you don't see it.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setIsSubmitted(false);
                    setSubmittedEmail("");
                  }}
                >
                  Try a different email
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
              </div>
            ) : (
              /* ── Form state ── */
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={isSubmitting}
                      {...register("email")}
                      className={`pl-9 ${errors.email ? "border-destructive" : ""}`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
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
                      Sending reset link...
                    </>
                  ) : (
                    "Send reset link"
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
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              This is a private system. Access is restricted to members only.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Vision2036. All rights reserved.
      </footer>
    </div>
  );
}
