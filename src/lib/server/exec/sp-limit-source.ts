/**
 * Source of the sp-limit sandbox launcher (C).
 *
 * Compiled unprivileged at server boot (see helpers.ts) and exec'd as the
 * last link of the isolation chain:
 *
 *   unshare -r -n -m … → env -i … → sp-limit cpu=… as=… -- <interpreter>
 *
 * It applies resource limits, seals the process with NO_NEW_PRIVS and
 * installs a seccomp BPF deny-list. Even code that escapes a language-level
 * sandbox (VM escape, ctypes, libc) CANNOT:
 *   - signal other processes on the host (kill/tgkill/tkill → EPERM;
 *     pidfd_send_signal / pidfd_getfd → EPERM)
 *   - inspect or hijack other processes (ptrace / process_vm_* / kcmp /
 *     perf_event_open → process killed)
 *   - mount/unmount, pivot_root, chroot (process killed)
 *   - load kernel modules, reboot, kexec, swap, quota, BPF, keyrings
 *
 * seccomp filters are inherited across execve and cannot be removed by the
 * child; NO_NEW_PRIVS blocks privilege escalation via setuid binaries.
 * Non-x86_64 syscall ABIs are killed outright (blocks 32-bit/x32 bypasses).
 */

export const SP_LIMIT_C_SOURCE = String.raw`#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sys/resource.h>
#include <sys/prctl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <sys/syscall.h>

static int setlim(int res, rlim_t v) {
  struct rlimit r;
  r.rlim_cur = v;
  r.rlim_max = v;
  return setrlimit(res, &r);
}

#define SP_KILL 0x80000000U /* SECCOMP_RET_KILL_PROCESS */

int main(int argc, char **argv) {
  rlim_t cpu = 10, as = 0 /* 0 = unlimited */, nproc = 1024, fsize = 8 * 1024 * 1024;
  rlim_t nofile = 256;
  int i = 1;
  for (; i < argc; i++) {
    char *a = argv[i];
    if (strcmp(a, "--") == 0) { i++; break; }
    if (strncmp(a, "cpu=", 4) == 0) cpu = strtoull(a + 4, NULL, 10);
    else if (strncmp(a, "as=", 3) == 0) as = strtoull(a + 3, NULL, 10);
    else if (strncmp(a, "nproc=", 6) == 0) nproc = strtoull(a + 6, NULL, 10);
    else if (strncmp(a, "fsize=", 6) == 0) fsize = strtoull(a + 6, NULL, 10);
    else if (strncmp(a, "nofile=", 7) == 0) nofile = strtoull(a + 7, NULL, 10);
    else { fprintf(stderr, "sp-limit: bad arg %s\n", a); return 2; }
  }
  if (i >= argc) { fprintf(stderr, "sp-limit: no command\n"); return 2; }

  setlim(RLIMIT_CPU, cpu ? cpu : RLIM_INFINITY);
  if (as) setlim(RLIMIT_AS, as);
  setlim(RLIMIT_NPROC, nproc);
  setlim(RLIMIT_FSIZE, fsize);
  setlim(RLIMIT_NOFILE, nofile);
  setlim(RLIMIT_CORE, 0);

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) { perror("sp-limit: prctl"); return 3; }

  static const int blocked[] = {
    SYS_ptrace,
    SYS_mount, SYS_umount2, SYS_pivot_root, SYS_chroot,
    SYS_reboot, SYS_swapon, SYS_swapoff, SYS_quotactl,
#ifdef SYS_kexec_load
    SYS_kexec_load,
#endif
#ifdef SYS_kexec_file_load
    SYS_kexec_file_load,
#endif
    SYS_init_module, SYS_finit_module, SYS_delete_module,
    SYS_setns, SYS_unshare,
    SYS_bpf, SYS_keyctl, SYS_add_key, SYS_request_key,
    SYS_name_to_handle_at, SYS_open_by_handle_at,
    SYS_clock_settime, SYS_settimeofday, SYS_adjtimex,
    SYS_process_vm_readv, SYS_process_vm_writev,
    SYS_perf_event_open, SYS_userfaultfd, SYS_kcmp,
    SYS_lookup_dcookie, SYS_syslog, SYS_vhangup, SYS_modify_ldt,
    SYS_iopl, SYS_ioperm
  };
  /* signaling other processes fails with EPERM instead of killing the
   * interpreter — candidates probing the sandbox get a readable error */
  static const int errnoBlocked[] = {
    SYS_kill, SYS_tkill, SYS_tgkill,
#ifdef SYS_pidfd_send_signal
    SYS_pidfd_send_signal,
#endif
#ifdef SYS_pidfd_getfd
    SYS_pidfd_getfd,
#endif
  };
  int n = (int)(sizeof(blocked) / sizeof(blocked[0]));
  int ne = (int)(sizeof(errnoBlocked) / sizeof(errnoBlocked[0]));

  struct sock_filter prog[8 + 3 * 64 + 3 * 8];
  int k = 0;
  /* kill any non-x86_64 ABI (blocks 32-bit/x32 syscall-table bypasses) */
  prog[k++] = (struct sock_filter)BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch));
  prog[k++] = (struct sock_filter)BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0);
  prog[k++] = (struct sock_filter)BPF_STMT(BPF_RET | BPF_K, SP_KILL);
  for (int j = 0; j < n; j++) {
    prog[k++] = (struct sock_filter)BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
    prog[k++] = (struct sock_filter)BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, blocked[j], 0, 1);
    prog[k++] = (struct sock_filter)BPF_STMT(BPF_RET | BPF_K, SP_KILL);
  }
  for (int j = 0; j < ne; j++) {
    prog[k++] = (struct sock_filter)BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
    prog[k++] = (struct sock_filter)BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, errnoBlocked[j], 0, 1);
    prog[k++] = (struct sock_filter)BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM);
  }
  prog[k++] = (struct sock_filter)BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW);

  struct sock_fprog fprog;
  fprog.len = (unsigned short)k;
  fprog.filter = prog;
  if (syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, 0, &fprog)) {
    perror("sp-limit: seccomp");
    return 3;
  }

  execvp(argv[i], &argv[i]);
  perror("sp-limit: execvp");
  return 127;
}
`;
