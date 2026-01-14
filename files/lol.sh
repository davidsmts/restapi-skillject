#!/bin/bash
# lol.sh - Infinite loop with a heavy computation

#echo "Starting infinite heavy computation loop..."

while true; do
  # Example: Calculate the first 10000 prime numbers (heavy task)
  count=0
  num=2
  while [ $count -lt 100000 ]; do
    is_prime=1
    for ((i=2; i*i<=num; i++)); do
      if (( num % i == 0 )); then
        is_prime=0
        break
      fi
    done
    if (( is_prime )); then
      count=$((count+1))
    fi
    num=$((num+1))
  done
  #echo "Calculated 10000 primes. Looping again..."
done
