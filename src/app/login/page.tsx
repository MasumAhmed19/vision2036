"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { loginSchema, type LoginFormData } from "@/lib/validations";
import { Logo } from "@/components/common/Logo";
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
import Image from "next/image";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
    } catch {
      // toast is already shown in AuthContext
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>




      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">

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
              <CardTitle className="text-2xl font-semibold">
                Welcome back
              </CardTitle>
              <CardDescription>
                Sign in to your account to continue
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  {...register("email")}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    {...register("password")}
                    className={`pr-10 ${errors.password ? "border-destructive" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

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
